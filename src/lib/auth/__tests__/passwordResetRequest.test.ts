// The Profile "Change password" request: one request at a time, never an
// invalid request without an email, and a clear outcome either way.
import { requestPasswordReset, type PasswordResetGuard } from '@/lib/auth/passwordResetRequest';

const guard = (): PasswordResetGuard => ({ current: false });

it('sends the reset link to the signed-in email (trimmed) and reports where it went', async () => {
  const send = jest.fn(async () => ({ error: null }));

  await expect(requestPasswordReset({ email: '  ramzi@example.com ', send, guard: guard() })).resolves.toEqual({
    kind: 'sent',
    email: 'ramzi@example.com',
  });
  expect(send).toHaveBeenCalledWith('ramzi@example.com');
});

it('a refused request returns its message', async () => {
  const send = jest.fn(async () => ({ error: 'Email rate limit exceeded' }));
  await expect(requestPasswordReset({ email: 'a@b.co', send, guard: guard() })).resolves.toEqual({
    kind: 'error',
    message: 'Email rate limit exceeded',
  });
});

it('a request that throws (offline) becomes a friendly error', async () => {
  const send = jest.fn(async () => {
    throw new Error('Network request failed');
  });
  const outcome = await requestPasswordReset({ email: 'a@b.co', send, guard: guard() });
  expect(outcome).toEqual({ kind: 'error', message: expect.stringMatching(/Couldn.t send the reset email/) });
});

it.each([undefined, null, '', '   '])('no email (%p): sends nothing and explains', async (email) => {
  const send = jest.fn();
  const outcome = await requestPasswordReset({ email, send, guard: guard() });
  expect(send).not.toHaveBeenCalled();
  expect(outcome).toEqual({ kind: 'error', message: expect.stringMatching(/no email address/i) });
});

it('a second tap while one is in flight is ignored — one request only', async () => {
  let resolve: (v: { error: string | null }) => void = () => {};
  const send = jest.fn(() => new Promise<{ error: string | null }>((r) => (resolve = r)));
  const shared = guard();

  const first = requestPasswordReset({ email: 'a@b.co', send, guard: shared });
  const second = await requestPasswordReset({ email: 'a@b.co', send, guard: shared });
  expect(second).toEqual({ kind: 'busy' });
  expect(send).toHaveBeenCalledTimes(1);

  resolve({ error: null });
  await expect(first).resolves.toEqual({ kind: 'sent', email: 'a@b.co' });
});

it('after a request finishes (even with an error), it can be retried', async () => {
  const send = jest
    .fn()
    .mockResolvedValueOnce({ error: 'Email rate limit exceeded' })
    .mockResolvedValueOnce({ error: null });
  const shared = guard();

  await requestPasswordReset({ email: 'a@b.co', send, guard: shared });
  await expect(requestPasswordReset({ email: 'a@b.co', send, guard: shared })).resolves.toEqual({ kind: 'sent', email: 'a@b.co' });
  expect(send).toHaveBeenCalledTimes(2);
});
