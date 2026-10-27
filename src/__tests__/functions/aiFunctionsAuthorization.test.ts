// Paid AI proxies and the answer email (run-1 security audit). Deno Edge
// Functions can't run under Jest, so these pin the order of operations and
// the controls in the source itself.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const read = (name: string) =>
  readFileSync(join(__dirname, `../../../supabase/functions/${name}/index.ts`), 'utf8').replace(/\/\/[^\n]*/g, '');

function indexOf(code: string, pattern: RegExp): number {
  const m = pattern.exec(code);
  if (!m) throw new Error(`not found: ${pattern}`);
  return m.index;
}

describe('talk-to-a-tunisian', () => {
  const code = read('talk-to-a-tunisian');

  it('consumes the per-account chat quota before any paid call', () => {
    const quota = indexOf(code, /\.rpc\('consume_ai_quota', \{ p_kind: 'chat' \}\)/);
    expect(quota).toBeLessThan(indexOf(code, /buildRetrievalSection\(supabase/));
    expect(quota).toBeLessThan(indexOf(code, /fetchWithTimeout\(`\$\{baseUrl\}\/chat\/completions`/));
  });

  it('fails closed: a quota error is never treated as allowed', () => {
    expect(code).toMatch(/if \(quotaError\) \{[\s\S]*?return quotaErrorResponse\(quotaError\);/);
    expect(code).toMatch(/if \(allowed !== true\) \{\s*return errorResponse\('daily_limit_reached'/);
  });

  it('no longer counts corrections rows by a client-chosen profileId as its cap', () => {
    expect(code).not.toMatch(/\.from\('corrections'\)\s*\.select\('id', \{ count: 'exact'/);
  });

  it('requires the profileId to belong to the caller before any paid call', () => {
    const own = indexOf(code, /\.from\('profiles'\)\s*\.select\('id'\)\s*\.eq\('id', body\.profileId\)/);
    expect(own).toBeLessThan(indexOf(code, /buildRetrievalSection\(supabase/));
    expect(code).toMatch(/return errorResponse\('forbidden', '[^']+', 403\)/);
  });

  it('bounds every prompt-bearing field before any paid call', () => {
    expect(code).toMatch(/const MAX_SYSTEM_PROMPT_CHARS = \d+/);
    expect(code).toMatch(/const MAX_TURN_CHARS = \d+/);
    expect(code).toMatch(/const MAX_RETRIEVAL_QUERY_CHARS = \d+/);
    const size = indexOf(code, /function oversizedField\(/);
    const check = indexOf(code, /const tooBig = oversizedField\(body\)/);
    expect(size).toBeLessThan(check);
    expect(check).toBeLessThan(indexOf(code, /\.rpc\('consume_ai_quota'/));
  });
});

describe.each([
  ['talk-tts', 'tts', /fetch\(`\$\{baseUrl\}\/audio\/speech`/],
  ['talk-stt', 'stt', /fetch\(`\$\{baseUrl\}\/audio\/transcriptions`/],
])('%s', (name, kind, paidCall) => {
  const code = read(name);

  it('builds a client from the caller’s own Authorization header', () => {
    expect(code).toMatch(/global: \{ headers: \{ Authorization: req\.headers\.get\('Authorization'\) \?\? '' \} \}/);
  });

  it(`consumes the per-account ${kind} quota (which also rejects callers with no user) before the paid call`, () => {
    const quota = indexOf(code, new RegExp(`\\.rpc\\('consume_ai_quota', \\{ p_kind: '${kind}' \\}\\)`));
    expect(quota).toBeLessThan(indexOf(code, paidCall));
    expect(code).toMatch(/if \(quotaError\) \{[\s\S]*?return quotaErrorResponse\(quotaError\);/);
    expect(code).toMatch(/if \(allowed !== true\) \{\s*return errorResponse\('daily_limit_reached'/);
  });
});

it('talk-stt rejects an oversized upload by Content-Length before buffering it', () => {
  const code = read('talk-stt');
  expect(indexOf(code, /req\.headers\.get\('content-length'\)/)).toBeLessThan(indexOf(code, /await req\.arrayBuffer\(\)/));
});

describe('translation-answered-email', () => {
  const code = read('translation-answered-email');

  it('sends to the verified auth email, not the editable accounts.email column', () => {
    expect(code).toMatch(/service\.auth\.admin\.getUserById\(request\.account_id\)/);
    expect(code).not.toMatch(/\.from\('accounts'\)/);
  });
});
