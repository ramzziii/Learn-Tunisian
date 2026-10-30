// Paid AI proxies and the answer email (run-1 security audit). The request
// handling of talk-to-a-tunisian / talk-tts / talk-stt now lives in each
// function's handler.ts and is exercised directly (talkChatHandler,
// talkTtsHandler, talkSttHandler tests). Deno can't run under Jest, so these
// pin how each index.ts wires that handler to Supabase.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const read = (name: string, file = 'index.ts') =>
  readFileSync(join(__dirname, `../../../supabase/functions/${name}/${file}`), 'utf8').replace(/\/\/[^\n]*/g, '');

describe.each([
  ['talk-to-a-tunisian', 'createChatHandler'],
  ['talk-tts', 'createTtsHandler'],
  ['talk-stt', 'createSttHandler'],
])('%s', (name, factory) => {
  const index = read(name);
  const handler = read(name, 'handler.ts');

  it('serves the tested handler', () => {
    expect(index).toMatch(new RegExp(`Deno\\.serve\\(\\s*${factory}\\(`));
  });

  it('verifies the caller’s JWT with Supabase Auth on the server', () => {
    expect(index).toMatch(/service\.auth\.getUser\(token\)/);
  });

  it('runs the per-account daily quota with the caller’s own JWT (auth.uid() is the account)', () => {
    expect(index).toMatch(/createClient\(supabaseUrl, supabaseAnonKey, \{ global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \} \}\)/);
    expect(index).toMatch(/asCaller\(token\)\.rpc\('consume_ai_quota', \{ p_kind: kind \}\)/);
  });

  it('does the budget accounting with the service-role client, whose key comes only from the environment', () => {
    expect(index).toMatch(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
    expect(index).toMatch(/store: supabaseBudgetStore\(service\)/);
  });

  it('the handler has no Deno or npm imports, and doesn’t log usage through a client-writable path', () => {
    expect(handler).not.toMatch(/Deno\.|from 'npm:/);
    expect(index + handler).not.toMatch(/from\('ai_usage_log'\)/);
  });
});

it('talk-to-a-tunisian checks profile ownership with the caller’s JWT (RLS), not the service role', () => {
  const index = read('talk-to-a-tunisian');
  expect(index).toMatch(/asCaller\(token\)\.from\('profiles'\)\.select\('id'\)\.eq\('id', profileId\)/);
});

it('talk-review meters its embedding through the same service-role budget store', () => {
  const index = read('talk-review');
  expect(index).toMatch(/store: supabaseBudgetStore\(service\)/);
  expect(read('talk-review', 'handler.ts')).toMatch(/callType: 'embedding'/);
});

describe('translation-answered-email', () => {
  const code = read('translation-answered-email');

  it('sends to the verified auth email, not the editable accounts.email column', () => {
    expect(code).toMatch(/service\.auth\.admin\.getUserById\(request\.account_id\)/);
    expect(code).not.toMatch(/\.from\('accounts'\)/);
  });
});
