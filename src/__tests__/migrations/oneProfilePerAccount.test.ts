// 0019_one_profile_per_account.sql: an account (= one Supabase Auth user =
// one login email) can hold at most one learner profile, enforced in the
// database for every caller — not just by the app hiding a button. It must
// not fail on, or touch, accounts that already have several profiles from
// an earlier version (see scripts/check-duplicate-profiles.sql).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const root = join(__dirname, '../../..');
const sql = readFileSync(join(root, 'supabase/migrations/0019_one_profile_per_account.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, '');

function fn(name: string): string {
  const match = new RegExp(`create (or replace )?function public\\.${name}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(body);
  if (!match) throw new Error(`function ${name} not found`);
  return match[0];
}

describe('enforce_one_profile_per_account', () => {
  const guard = () => fn('enforce_one_profile_per_account');

  it('is a SECURITY DEFINER trigger function with a pinned search_path', () => {
    expect(guard()).toMatch(/returns trigger/i);
    expect(guard()).toMatch(/security definer/i);
    expect(guard()).toMatch(/set search_path = public/i);
  });

  it('serialises profile creation per account by locking the account row', () => {
    expect(guard()).toMatch(/perform 1 from public\.accounts where id = new\.account_id for update/i);
  });

  it('rejects a profile when the account already has another one', () => {
    expect(guard()).toMatch(
      /exists \(\s*select 1 from public\.profiles\s+where account_id = new\.account_id and id <> new\.id\s*\)/i
    );
    expect(guard()).toMatch(/raise exception 'profile_already_exists' using errcode = '23505'/i);
  });

  it('lets an update that keeps the same account through (legacy duplicates stay editable)', () => {
    expect(guard()).toMatch(/tg_op = 'UPDATE' and new\.account_id = old\.account_id/i);
  });

  it('applies to every caller — no auth.uid()/admin/service-role exemption', () => {
    expect(guard()).not.toMatch(/auth\.uid\(\)|is_admin|service_role/i);
  });

  it('runs before every insert, and before a profile is moved to another account', () => {
    expect(body).toMatch(
      /create trigger profiles_one_per_account\s+before insert or update of account_id on public\.profiles\s+for each row execute function public\.enforce_one_profile_per_account\(\)/i
    );
  });
});

describe('safe on existing data', () => {
  it('changes no data and adds no constraint that existing duplicates would break', () => {
    expect(body).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|column)\b/i);
    expect(body).not.toMatch(/\bupdate\s+public\.profiles\b|\binsert\s+into\s+public\.profiles\b/i);
    expect(body).not.toMatch(/create unique index|\bunique\s*\(|add constraint/i);
  });
});

describe('scripts/check-duplicate-profiles.sql', () => {
  const check = readFileSync(join(root, 'scripts/check-duplicate-profiles.sql'), 'utf8').replace(/--[^\n]*/g, '');

  it('counts accounts holding more than one profile', () => {
    expect(check).toMatch(/group by account_id\s+having count\(\*\) > 1/i);
  });

  it('is read-only', () => {
    expect(check).not.toMatch(/\b(delete|update|insert|drop|truncate|alter|create)\b/i);
  });
});
