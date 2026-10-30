// talk-review's Deno entry point (index.ts) wires the handler to Supabase.
// Deno can't run under Jest, so this pins the wiring in the source: the JWT
// is verified server-side, reviewer membership is looked up with the
// service role (never trusted from the client), admin status plays no part,
// and the service-role key only ever comes from the function's environment.
// The handler's behaviour itself is exercised in talkReviewHandler.test.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const dir = join(__dirname, '../../../supabase/functions/talk-review');
const index = readFileSync(join(dir, 'index.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');
const handler = readFileSync(join(dir, 'handler.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');

it('uses the service-role key from the function environment only', () => {
  expect(index).toMatch(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  expect(index).not.toMatch(/req\.headers\.get\([^)]*service/i);
});

it('verifies the caller’s JWT with Supabase Auth on the server', () => {
  expect(index).toMatch(/\.auth\.getUser\(token\)/);
});

it('looks reviewer membership up in public.reviewers by the verified user id', () => {
  expect(index).toMatch(/\.from\('reviewers'\)\s*\.select\('user_id'\)\s*\.eq\('user_id', userId\)/);
});

it('does not treat admin status as reviewer permission', () => {
  expect(index + handler).not.toMatch(/is_admin/);
});

it('promotes and updates the review log only through the service-role client', () => {
  expect(index).toMatch(/service\s*\.from\('corrections'\)\s*\.update\(/);
  expect(index).toMatch(/service\.from\(table\)\.insert\(/);
  // The claim only succeeds on a still-pending row.
  expect(index).toMatch(/\.is\('is_correct', null\)/);
});

it('the handler has no Deno or npm imports, so it can be tested in Node', () => {
  expect(handler).not.toMatch(/Deno\.|from 'npm:/);
});
