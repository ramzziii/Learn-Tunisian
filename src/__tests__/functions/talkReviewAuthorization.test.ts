// talk-review promotes AI text into the verified RAG corpus and spends the
// app's AI key on an embedding. It must refuse non-admins before either of
// those happens (run-1 security audit). Deno Edge Functions can't run under
// Jest, so this pins the order of operations in the source itself.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const source = readFileSync(join(__dirname, '../../../supabase/functions/talk-review/index.ts'), 'utf8');
const code = source.replace(/\/\/[^\n]*/g, ''); // ignore comments

const at = (pattern: RegExp) => {
  const m = pattern.exec(code);
  if (!m) throw new Error(`not found: ${pattern}`);
  return m.index;
};

it('checks is_admin with the caller’s own JWT', () => {
  expect(code).toMatch(/\.rpc\('is_admin'\)/);
});

it('refuses with 403 unless is_admin is exactly true (fails closed on an RPC error)', () => {
  expect(code).toMatch(/if \(adminError \|\| isAdmin !== true\) \{\s*return errorResponse\('forbidden', '[^']+', 403\);/);
});

it('the admin check happens before the paid embeddings call and before the verified insert', () => {
  const check = at(/\.rpc\('is_admin'\)/);
  expect(check).toBeLessThan(at(/fetch\(`\$\{baseUrl\}\/embeddings`/));
  expect(check).toBeLessThan(at(/\.from\(table\)\.insert\(/));
});
