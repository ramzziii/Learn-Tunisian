// 0020_language_reviewers.sql: reviewing AI-generated Tunisian Arabic is
// restricted to an explicit allowlist (public.reviewers), separate from
// admin status. Pending corrections are readable only by reviewers, and
// verified content can only be written by the server-side review flow
// (service role) — not by any client, admin or not. Learners' reads of
// already-verified content are unchanged.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0020_language_reviewers.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, '');

const policies = (table: string) =>
  [...body.matchAll(new RegExp(`create policy "([^"]+)" on public\\.${table}\\s+for (\\w+)([^;]*);`, 'gi'))].map((m) => ({
    name: m[1],
    command: m[2].toLowerCase(),
    rest: m[3],
  }));

describe('public.reviewers', () => {
  it('is keyed by the auth user and removed with it', () => {
    expect(body).toMatch(
      /create table public\.reviewers \(\s*user_id uuid primary key references auth\.users \(id\) on delete cascade/i
    );
  });

  it('is created empty: no seeded rows, emails, UUIDs or automatic admins', () => {
    expect(body).not.toMatch(/insert\s+into\s+public\.reviewers/i);
    expect(body).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    expect(body).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i);
    expect(body).not.toMatch(/is_admin/i);
  });

  it('has RLS on, with a single read-own-row policy and no client write policy', () => {
    expect(body).toMatch(/alter table public\.reviewers enable row level security/i);
    const p = policies('reviewers');
    expect(p.map((x) => x.command)).toEqual(['select']);
    expect(p[0].rest).toMatch(/to authenticated\s+using \(user_id = auth\.uid\(\)\)/i);
  });

  it('grants clients read only — writes are revoked at the privilege level too', () => {
    expect(body).toMatch(/revoke all on public\.reviewers from public, anon, authenticated/i);
    expect(body).toMatch(/grant select on public\.reviewers to authenticated/i);
    expect(body).not.toMatch(/grant (insert|update|delete|all)[^;]*on public\.reviewers/i);
  });
});

describe('is_reviewer()', () => {
  const fn = () => {
    const m = /create (or replace )?function public\.is_reviewer\(\)([\s\S]*?)\$\$([\s\S]*?)\$\$/i.exec(body);
    if (!m) throw new Error('is_reviewer not found');
    return m[0];
  };

  it('takes no arguments — it can only answer for the caller', () => {
    expect(fn()).toMatch(/where user_id = auth\.uid\(\)/i);
  });

  it('is a stable SECURITY DEFINER function with a pinned search_path', () => {
    expect(fn()).toMatch(/stable/i);
    expect(fn()).toMatch(/security definer/i);
    expect(fn()).toMatch(/set search_path = public/i);
  });

  it('is callable by signed-in users only', () => {
    expect(body).toMatch(/revoke all on function public\.is_reviewer\(\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.is_reviewer\(\) to authenticated/i);
  });
});

describe('corrections (the review queue)', () => {
  it('drops the old admin read/update policies and the unrestricted insert', () => {
    expect(body).toMatch(/drop policy "corrections_select_own_or_admin" on public\.corrections/i);
    expect(body).toMatch(/drop policy "corrections_update_admin" on public\.corrections/i);
    expect(body).toMatch(/drop policy "corrections_insert_own_profile" on public\.corrections/i);
  });

  it('only reviewers can read corrections (pending or reviewed); learners can’t read even their own', () => {
    const select = policies('corrections').filter((p) => p.command === 'select');
    expect(select).toHaveLength(1);
    expect(select[0].rest).toMatch(/using \(public\.is_reviewer\(\)\)/i);
  });

  it('learners can only log new, still-pending turns for their own profile', () => {
    const insert = policies('corrections').filter((p) => p.command === 'insert');
    expect(insert).toHaveLength(1);
    expect(insert[0].rest).toMatch(/profile_id in \(select id from public\.profiles where account_id = auth\.uid\(\)\)/i);
    for (const column of ['is_correct', 'corrected_text', 'reviewer_name', 'reviewed_at', 'correction_reason']) {
      expect(insert[0].rest).toMatch(new RegExp(`${column} is null`, 'i'));
    }
  });

  it('no client can update or delete a correction (only talk-review, via the service role)', () => {
    expect(policies('corrections').map((p) => p.command)).not.toEqual(expect.arrayContaining(['update']));
    expect(policies('corrections').map((p) => p.command)).not.toEqual(expect.arrayContaining(['delete']));
    expect(body).toMatch(/revoke update, delete, truncate on public\.corrections from anon, authenticated/i);
    expect(body).toMatch(/revoke all on public\.corrections from anon/i);
  });
});

describe('verified content: phrases, sentences, conversation_examples', () => {
  it.each(['phrases', 'sentences', 'conversation_examples'])('%s: client write policies dropped and privileges revoked', (table) => {
    for (const op of ['insert', 'update', 'delete']) {
      expect(body).toMatch(new RegExp(`drop policy "${table}_${op}_admin" on public\\.${table}`, 'i'));
    }
    expect(policies(table)).toEqual([]);
    expect(body).toMatch(new RegExp(`revoke insert, update, delete, truncate on public\\.${table} from anon, authenticated`, 'i'));
  });

  it('leaves the learners’ read-verified policies alone', () => {
    expect(body).not.toMatch(/drop policy "(phrases|sentences|conversation_examples)_read_verified"/i);
    expect(body).not.toMatch(/revoke (all|select)[^;]*on public\.(phrases|sentences|conversation_examples)/i);
  });
});

it('is non-destructive: no table or column drops, no data deleted', () => {
  expect(body).not.toMatch(/drop (table|column)|\bdelete\s+from\b|\btruncate\s+(table\s+)?public\./i);
});
