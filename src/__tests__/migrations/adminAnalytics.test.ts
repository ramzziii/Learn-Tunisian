// The analytics function is the only way admin analytics reads cross-user
// data (every learner table is owner-only under RLS). These checks pin its
// safety properties in the migration itself — they can't be exercised
// without a database, so they're asserted on the SQL.
// Node's fs/path via require: the app's tsconfig has no Node typings.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0014_admin_analytics.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, ''); // ignore comments

describe('admin_analytics_overview', () => {
  it('is a SECURITY DEFINER function with a pinned search_path', () => {
    expect(body).toMatch(/create (or replace )?function public\.admin_analytics_overview\s*\(\s*p_days int/i);
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = public/i);
  });

  it('refuses anyone who is not an admin, with a permission error', () => {
    expect(body).toMatch(/if not public\.is_admin\(\) then\s+raise exception '[^']*' using errcode = '42501'/i);
  });

  it('only accepts the supported periods', () => {
    expect(body).toMatch(/p_days not in \(7, 30, 90\)/i);
  });

  it('cannot be called anonymously', () => {
    expect(body).toMatch(/revoke all on function public\.admin_analytics_overview\(int\) from public/i);
    expect(body).toMatch(/revoke all on function public\.admin_analytics_overview\(int\) from anon/i);
    expect(body).toMatch(/grant execute on function public\.admin_analytics_overview\(int\) to authenticated/i);
  });

  it('returns aggregates only — never emails or ids', () => {
    expect(body).not.toMatch(/\bemail\b/i);
    expect(body).not.toMatch(/'(account|profile)_id'\s*,/i);
  });

  it('uses whole UTC days for the period, ending at the start of tomorrow', () => {
    expect(body).toMatch(/date_trunc\('day', now\(\) at time zone 'utc'\)/i);
  });

  it('leaves admin accounts out of learner metrics', () => {
    expect(body).toMatch(/not a\.is_admin/i);
  });

  it('folds small country groups into "Other"', () => {
    expect(body).toMatch(/min_group constant int := 3/i);
    expect(body).toMatch(/'Other'/);
  });
});
