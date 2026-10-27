// Fixes from the run-1 security audit (0017_security_fixes.sql): only admins
// may write the AI tutor's "verified" reference content, ai_usage_log is no
// longer readable/writable across accounts, and a learner can again read
// their own answer audio (the 0016 storage policy subqueried a table learners
// can't select, so it always denied them). Asserted on the SQL, like the
// other migration tests — none of this can run without a database.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0017_security_fixes.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, '');

function fn(name: string): string {
  const match = new RegExp(`create (or replace )?function public\\.${name}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(body);
  if (!match) throw new Error(`function ${name} not found`);
  return match[0];
}

/** Every `create policy` on a table: [name, command, full text]. */
function policiesOn(table: string): { name: string; cmd: string; text: string }[] {
  const re = new RegExp(`create policy "([^"]+)" on ${table.replace('.', '\\.')}\\s+for (\\w+)([^;]*);`, 'gi');
  return [...body.matchAll(re)].map((m) => ({ name: m[1], cmd: m[2].toLowerCase(), text: m[3] }));
}

describe('RAG reference content: admin-only writes', () => {
  it.each(['phrases', 'sentences', 'conversation_examples'])('%s: the any-authenticated insert policy is dropped', (table) => {
    expect(body).toMatch(new RegExp(`drop policy "${table}_insert_authenticated" on public\\.${table}`, 'i'));
  });

  it.each(['phrases', 'sentences', 'conversation_examples'])('%s: insert, update and delete are admin-only', (table) => {
    const policies = policiesOn(`public.${table}`);
    expect(policies.map((p) => p.cmd).sort()).toEqual(['delete', 'insert', 'update']);
    for (const p of policies) {
      expect(p.text).toMatch(/public\.is_admin\(\)/i);
      expect(p.text).not.toMatch(/auth\.role\(\)/i);
    }
  });

  it('leaves the verified-only read policies alone (learners still read native_verified rows)', () => {
    expect(body).not.toMatch(/drop policy "(phrases|sentences|conversation_examples)_read_verified"/i);
  });
});

describe('ai_usage_log: no cross-account access', () => {
  const policies = () => policiesOn('public.ai_usage_log');

  it('drops the FOR ALL authenticated policy', () => {
    expect(body).toMatch(/drop policy "ai_usage_log_all_authenticated" on public\.ai_usage_log/i);
  });

  it('only allows inserting rows for the caller’s own profiles', () => {
    const insert = policies().find((p) => p.cmd === 'insert');
    expect(insert?.text).toMatch(/with check \(\s*profile_id in \(select id from public\.profiles where account_id = auth\.uid\(\)\)\s*\)/i);
  });

  it('reading is limited to admins or the caller’s own profiles', () => {
    const select = policies().find((p) => p.cmd === 'select');
    expect(select?.text).toMatch(/public\.is_admin\(\)/i);
    expect(select?.text).toMatch(/profile_id in \(select id from public\.profiles where account_id = auth\.uid\(\)\)/i);
  });

  it('clients can no longer update or delete usage rows (cost record integrity)', () => {
    expect(policies().map((p) => p.cmd).sort()).toEqual(['insert', 'select']);
  });
});

describe('translation answer audio: the requester can read their own files again', () => {
  const helper = () => fn('can_read_own_translation_audio');

  it('checks ownership in a SECURITY DEFINER helper (learners cannot select translation_requests directly)', () => {
    expect(helper()).toMatch(/security definer/i);
    expect(helper()).toMatch(/set search_path = public/i);
    expect(helper()).toMatch(/stable/i);
  });

  it('matches only the caller’s own answered request, and only its two audio paths', () => {
    expect(helper()).toMatch(/r\.account_id = auth\.uid\(\)/i);
    expect(helper()).toMatch(/r\.status = 'answered'/i);
    expect(helper()).toMatch(/p_object_name in \(r\.answer_audio_path, r\.answer_explanation_audio_path\)/i);
  });

  it('is callable by signed-in users only', () => {
    expect(body).toMatch(/revoke all on function public\.can_read_own_translation_audio\(text\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.can_read_own_translation_audio\(text\) to authenticated/i);
  });

  it('replaces the read policy with one that uses the helper — no direct subquery on translation_requests', () => {
    expect(body).toMatch(/drop policy "translation_audio_read_own_answer" on storage\.objects/i);
    const read = policiesOn('storage.objects').find((p) => p.name === 'translation_audio_read_own_answer');
    expect(read?.cmd).toBe('select');
    expect(read?.text).toMatch(/bucket_id = 'translation-audio'/i);
    expect(read?.text).toMatch(/public\.is_admin\(\)\s+or public\.can_read_own_translation_audio\(name\)/i);
    expect(read?.text).not.toMatch(/translation_requests/i);
  });
});
