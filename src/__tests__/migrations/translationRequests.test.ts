// Request a Translation's security lives in the database: the client can't
// write translation_requests directly, the free limit is counted per
// *account* by the server, Premium can't be self-granted, learners only ever
// see their own visible requests, and answer audio sits in a private bucket.
// None of that can be exercised without a database, so these checks pin it
// in the migration SQL itself (same approach as adminAnalytics.test.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0015_translation_requests.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, ''); // ignore comments

/** The body of one `create function public.<name>(...) ... $$ ... $$;`. */
function fn(name: string): string {
  const match = new RegExp(`create (or replace )?function public\\.${name}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(body);
  if (!match) throw new Error(`function ${name} not found`);
  return match[0];
}

const LEARNER_RPCS = [
  'submit_translation_request(text, uuid)',
  'translation_request_allowance()',
  'my_translation_requests()',
  'cancel_translation_request(uuid)',
  'mark_translation_answers_seen()',
];
const ADMIN_RPCS = [
  'admin_mark_translation_request_in_progress(uuid)',
  'admin_reject_translation_request(uuid)',
  'admin_set_translation_answer_audio(uuid, text)',
  'admin_answer_translation_request(uuid, text, text, text)',
  'admin_link_translation_shared_content(uuid, text)',
];

describe('translation_requests table', () => {
  it('is owned by an account and has RLS on', () => {
    expect(body).toMatch(/create table public\.translation_requests/i);
    expect(body).toMatch(/account_id uuid not null references public\.accounts \(id\) on delete cascade/i);
    expect(body).toMatch(/alter table public\.translation_requests enable row level security/i);
  });

  it('clients can only read it as an admin — no insert/update/delete policies at all (writes go through the RPCs)', () => {
    const policies = [...body.matchAll(/create policy "[^"]+" on public\.translation_requests\s+for (\w+)\s+using \(([^;]*)\);/gi)];
    expect(policies.map((p) => p[1].toLowerCase())).toEqual(['select']);
    expect(policies[0][2]).toMatch(/public\.is_admin\(\)/);
  });

  it('keeps every status for the admin record, including rejected and cancelled', () => {
    expect(body).toMatch(/status in \('submitted', 'in_progress', 'answered', 'rejected', 'cancelled'\)/i);
  });

  it('an "answered" row must hold the complete answer and audio', () => {
    expect(body).toMatch(
      /status <> 'answered' or \(\s*answer_arabic is not null\s+and answer_transliteration is not null\s+and answer_english is not null\s+and answer_audio_path is not null\s+and answered_at is not null\s*\)/i
    );
  });

  it('limits sizes in the database too', () => {
    expect(body).toMatch(/char_length\(english_text\) between 1 and 500/i);
    for (const col of ['answer_arabic', 'answer_transliteration', 'answer_english']) {
      expect(body).toMatch(new RegExp(`${col} text check \\(char_length\\(${col}\\) <= 500\\)`, 'i'));
    }
  });

  it('a rapid double tap can’t create two requests (one per client key per account)', () => {
    expect(body).toMatch(/unique \(account_id, client_request_id\)/i);
  });
});

describe('Premium can’t be self-granted', () => {
  it('a trigger stops non-admin app sessions from setting profiles.is_premium on insert or update', () => {
    const guard = fn('prevent_self_premium_grant');
    expect(guard).toMatch(/auth\.uid\(\) is not null and not public\.is_admin\(\)/i);
    expect(guard).toMatch(/tg_op = 'INSERT' and new\.is_premium/i);
    expect(guard).toMatch(/new\.is_premium is distinct from old\.is_premium/i);
    expect(body).toMatch(/before insert or update on public\.profiles\s+for each row execute function public\.prevent_self_premium_grant\(\)/i);
  });
});

describe('submit_translation_request', () => {
  const submit = () => fn('submit_translation_request');

  it('is SECURITY DEFINER with a pinned search_path, and requires a signed-in caller', () => {
    expect(submit()).toMatch(/security definer/i);
    expect(submit()).toMatch(/set search_path = public/i);
    expect(submit()).toMatch(/if v_uid is null then\s+raise exception 'not_authenticated' using errcode = '42501'/i);
  });

  it('owns the request by auth.uid() — never by anything the client sends', () => {
    expect(submit()).toMatch(/v_uid uuid := auth\.uid\(\)/i);
    expect(submit()).toMatch(/insert into public\.translation_requests \(account_id, client_request_id, english_text, due_at\)\s+values \(v_uid,/i);
  });

  it('validates the text server-side', () => {
    expect(submit()).toMatch(/char_length\(v_text\) = 0 or char_length\(v_text\) > 500/i);
  });

  it('serializes submits per account, so parallel requests can’t both pass the free check', () => {
    expect(submit()).toMatch(/from public\.accounts where id = v_uid for update/i);
  });

  it('repeating the same client key returns the existing request instead of a new one', () => {
    expect(submit()).toMatch(/client_request_id = p_client_request_id/i);
  });

  it('free accounts get one request in total (every request except admin-rejected ones counts)', () => {
    expect(submit()).toMatch(/if not public\.account_has_translation_premium\(v_uid\) then/i);
    expect(submit()).toMatch(/count\(\*\) into v_used from public\.translation_requests\s+where account_id = v_uid and status <> 'rejected'/i);
    expect(submit()).toMatch(/if v_used >= 1 then\s+raise exception 'free_limit_reached'/i);
  });

  it('the deadline is set by the server, not the client', () => {
    expect(submit()).toMatch(/public\.translation_request_due_at\(now\(\)\)/i);
  });
});

describe('entitlement is per account, from authoritative data', () => {
  it('Premium if the account is an admin or any of its profiles is Premium — switching profiles changes nothing', () => {
    const premium = fn('account_has_translation_premium');
    expect(premium).toMatch(/select is_admin from public\.accounts where id = p_account_id/i);
    expect(premium).toMatch(/exists \(select 1 from public\.profiles where account_id = p_account_id and is_premium\)/i);
  });

  it('the allowance shown in the app is the same server count', () => {
    const allowance = fn('translation_request_allowance');
    expect(allowance).toMatch(/account_has_translation_premium\(v_uid\)/i);
    expect(allowance).toMatch(/status <> 'rejected'/i);
  });
});

describe('learner reads', () => {
  it('my_translation_requests only returns the caller’s own submitted/answered requests', () => {
    const mine = fn('my_translation_requests');
    expect(mine).toMatch(/where r\.account_id = auth\.uid\(\)\s+and r\.status in \('submitted', 'in_progress', 'answered'\)/i);
  });

  it('never leaks a draft answer before it is sent', () => {
    const mine = fn('my_translation_requests');
    for (const col of ['answer_arabic', 'answer_transliteration', 'answer_english', 'answer_audio_path']) {
      expect(mine).toMatch(new RegExp(`case when r\\.status = 'answered' then r\\.${col} end`, 'i'));
    }
    expect(mine).not.toMatch(/handled_by|email_status|client_request_id/i);
  });

  it('learners can cancel only their own still-pending request', () => {
    const cancel = fn('cancel_translation_request');
    expect(cancel).toMatch(/where id = p_request_id and account_id = auth\.uid\(\) and status in \('submitted', 'in_progress'\)/i);
    expect(cancel).toMatch(/raise exception 'not_cancellable'/i);
  });
});

describe('admin RPCs', () => {
  it.each(['admin_mark_translation_request_in_progress', 'admin_reject_translation_request', 'admin_set_translation_answer_audio', 'admin_answer_translation_request', 'admin_link_translation_shared_content'])(
    '%s refuses non-admins',
    (name) => {
      expect(fn(name)).toMatch(/if not public\.is_admin\(\) then\s+raise exception '[^']*' using errcode = '42501'/i);
      expect(fn(name)).toMatch(/security definer/i);
    }
  );

  it('answering locks the row, requires it still open and the audio already saved, then marks it answered', () => {
    const answer = fn('admin_answer_translation_request');
    expect(answer).toMatch(/for update/i);
    expect(answer).toMatch(/v_status not in \('submitted', 'in_progress'\)/i);
    expect(answer).toMatch(/raise exception 'not_open'/i);
    expect(answer).toMatch(/v_audio is null then\s+raise exception 'answer_audio_missing'/i);
    expect(answer).toMatch(/status = 'answered'/i);
  });

  it('answer audio can only point inside that request’s own folder', () => {
    expect(fn('admin_set_translation_answer_audio')).toMatch(/p_audio_path like p_request_id::text \|\| '\/%'/i);
  });

  it('rejecting keeps the row (non-visible status) rather than deleting it', () => {
    const reject = fn('admin_reject_translation_request');
    expect(reject).toMatch(/set status = 'rejected'/i);
    expect(reject).not.toMatch(/delete from/i);
  });
});

it.each([...LEARNER_RPCS, ...ADMIN_RPCS])('%s can’t be called anonymously', (signature) => {
  const escaped = signature.replace(/[()]/g, (c) => `\\${c}`);
  expect(body).toMatch(new RegExp(`revoke all on function public\\.${escaped} from public, anon`, 'i'));
  expect(body).toMatch(new RegExp(`grant execute on function public\\.${escaped} to authenticated`, 'i'));
});

describe('business-day deadline (matches src/lib/translationRequests/deadline.ts)', () => {
  it('counts 3 Monday–Friday days in Tunis time, due at the end of the third', () => {
    const due = fn('translation_request_due_at');
    expect(due).toMatch(/at time zone 'Africa\/Tunis'/i);
    expect(due).toMatch(/while v_added < 3 loop/i);
    expect(due).toMatch(/extract\(isodow from v_day\) < 6/i);
    expect(due).toMatch(/\(v_day \+ 1\)::timestamp at time zone 'Africa\/Tunis'/i);
  });
});

describe('answer audio storage', () => {
  it('is a private bucket', () => {
    expect(body).toMatch(/insert into storage\.buckets \(id, name, public[^)]*\)\s+values \('translation-audio', 'translation-audio', false/i);
  });

  it('only admins write it', () => {
    for (const op of ['insert', 'update', 'delete']) {
      expect(body).toMatch(new RegExp(`on storage\\.objects\\s+for ${op}[^;]*bucket_id = 'translation-audio' and public\\.is_admin\\(\\)`, 'i'));
    }
  });

  it('a learner can read only the audio of their own answered request', () => {
    expect(body).toMatch(
      /for select using \(\s*bucket_id = 'translation-audio'\s+and \(\s*public\.is_admin\(\)\s+or exists \(\s*select 1 from public\.translation_requests r\s+where r\.account_id = auth\.uid\(\)\s+and r\.status = 'answered'\s+and r\.answer_audio_path = storage\.objects\.name/i
    );
  });
});
