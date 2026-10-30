// delete-account's Deno entry point (index.ts) can't run under Jest; this
// pins how it wires the tested handler: the JWT is verified with Supabase
// Auth, the service-role key comes only from the function environment, the
// database step is the service-role-only delete_account_data RPC, files go
// through the Storage API (not SQL), and the Auth user is removed with the
// Admin API as a hard delete.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const dir = join(__dirname, '../../../supabase/functions/delete-account');
const index = readFileSync(join(dir, 'index.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');
const handler = readFileSync(join(dir, 'handler.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');

it('serves the tested handler', () => {
  expect(index).toMatch(/Deno\.serve\(\s*createDeleteAccountHandler\(/);
});

it('verifies the JWT server-side and recognises an already-deleted user', () => {
  expect(index).toMatch(/service\.auth\.getUser\(token\)/);
  expect(index).toMatch(/user_not_found/);
});

it('uses the service-role key from the environment only', () => {
  expect(index).toMatch(/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  expect(index).not.toMatch(/req\.headers\.get\([^)]*service/i);
});

it('database step: the service-role-only RPCs, with the verified id', () => {
  expect(index).toMatch(/service\.rpc\('account_storage_objects', \{ p_account_id: accountId \}\)/);
  expect(index).toMatch(/service\.rpc\('delete_account_data', \{ p_account_id: accountId \}\)/);
});

it('files are removed through the Storage API, never by deleting storage.objects rows', () => {
  expect(index).toMatch(/service\.storage\.from\(bucket\)\.remove\(names\)/);
  expect(index + handler).not.toMatch(/storage\.objects/);
});

it('the Auth user is hard-deleted with the Admin API', () => {
  expect(index).toMatch(/service\.auth\.admin\.deleteUser\(accountId, false\)/);
});

it('the handler has no Deno or npm imports', () => {
  expect(handler).not.toMatch(/Deno\.|from 'npm:/);
});
