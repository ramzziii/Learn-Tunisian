// 0018_ai_quota_and_account_email.sql (run-1 security audit):
// - one server-owned daily AI quota per ACCOUNT, consumed atomically before
//   any paid AI call — replaces talk-to-a-tunisian's per-profile cap, which
//   was keyed on a client-supplied profileId and failed open, and gives
//   talk-tts / talk-stt the caller check and quota they never had;
// - learners can no longer rewrite accounts.email (the admin bootstrap and
//   the translation-answered email both trusted it); it is kept in sync with
//   the verified auth.users email instead.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0018_ai_quota_and_account_email.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, '');

function fn(name: string): string {
  const match = new RegExp(`create (or replace )?function public\\.${name}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(body);
  if (!match) throw new Error(`function ${name} not found`);
  return match[0];
}

describe('ai_daily_usage counter table', () => {
  it('is keyed by account, day and kind, and removed with the account', () => {
    expect(body).toMatch(/create table public\.ai_daily_usage/i);
    expect(body).toMatch(/account_id uuid not null references public\.accounts \(id\) on delete cascade/i);
    expect(body).toMatch(/kind text not null check \(kind in \('chat', 'tts', 'stt'\)\)/i);
    expect(body).toMatch(/primary key \(account_id, usage_date, kind\)/i);
  });

  it('has RLS on, with read-only access for the owner or an admin and no client write policy', () => {
    expect(body).toMatch(/alter table public\.ai_daily_usage enable row level security/i);
    const policies = [...body.matchAll(/create policy "[^"]+" on public\.ai_daily_usage\s+for (\w+)([^;]*);/gi)];
    expect(policies.map((p) => p[1].toLowerCase())).toEqual(['select']);
    expect(policies[0][2]).toMatch(/account_id = auth\.uid\(\) or public\.is_admin\(\)/i);
  });
});

describe('consume_ai_quota', () => {
  const quota = () => fn('consume_ai_quota');

  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(quota()).toMatch(/security definer/i);
    expect(quota()).toMatch(/set search_path = public/i);
  });

  it('refuses callers without a user identity (anon key alone gets nothing)', () => {
    expect(quota()).toMatch(/if v_uid is null then\s+raise exception 'not_authenticated' using errcode = '42501'/i);
  });

  it('rejects unknown kinds', () => {
    expect(quota()).toMatch(/raise exception 'invalid_quota_kind'/i);
  });

  it('counts per account per UTC day, atomically, and only while under the limit', () => {
    expect(quota()).toMatch(/\(now\(\) at time zone 'utc'\)::date/i);
    expect(quota()).toMatch(/insert into public\.ai_daily_usage \(account_id, usage_date, kind, count\)\s+values \(v_uid, v_day, p_kind, 1\)/i);
    expect(quota()).toMatch(/on conflict \(account_id, usage_date, kind\) do update\s+set count = public\.ai_daily_usage\.count \+ 1\s+where public\.ai_daily_usage\.count < v_limit/i);
    expect(quota()).toMatch(/return v_count is not null/i);
  });

  it('has a limit for every kind', () => {
    expect(quota()).toMatch(/when 'chat' then \d+/i);
    expect(quota()).toMatch(/when 'tts' then \d+/i);
    expect(quota()).toMatch(/when 'stt' then \d+/i);
  });

  it('is callable by signed-in users only', () => {
    expect(body).toMatch(/revoke all on function public\.consume_ai_quota\(text\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.consume_ai_quota\(text\) to authenticated/i);
  });
});

describe('accounts.email can no longer be rewritten by learners', () => {
  it('revokes client UPDATE on accounts (the app never updates it)', () => {
    expect(body).toMatch(/revoke update on public\.accounts from authenticated, anon/i);
  });

  it('keeps accounts.email in sync with the verified auth email', () => {
    const sync = fn('sync_account_email');
    expect(sync).toMatch(/security definer/i);
    expect(sync).toMatch(/update public\.accounts set email = new\.email where id = new\.id/i);
    expect(body).toMatch(/after update of email on auth\.users\s+for each row execute function public\.sync_account_email\(\)/i);
  });

  it('repairs any value that already drifted from auth.users', () => {
    expect(body).toMatch(/update public\.accounts a\s+set email = u\.email\s+from auth\.users u\s+where u\.id = a\.id and a\.email is distinct from u\.email/i);
  });
});
