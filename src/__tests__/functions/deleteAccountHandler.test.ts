/**
 * @jest-environment node
 */
// delete-account Edge Function, run for real against a fake backend that
// remembers state between calls (so retries after a partial failure are
// meaningful). The account deleted is always the one the verified JWT
// belongs to; nothing in the request body can change that. Order: storage
// files → database (delete_account_data) → Auth user, and success is only
// reported once the Auth user is gone.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createDeleteAccountHandler } = require('../../../supabase/functions/delete-account/handler.ts');

const A = 'account-a';
const B = 'account-b';

type Step = 'list' | 'remove' | 'database' | 'auth';

function fakeBackend(opts: { failOnce?: Step[]; failAlways?: Step[] } = {}) {
  const failOnce = new Set(opts.failOnce ?? []);
  const fail = (step: Step) => {
    if (opts.failAlways?.includes(step)) throw new Error(`${step} failed (simulated)`);
    if (failOnce.has(step)) {
      failOnce.delete(step);
      throw new Error(`${step} failed (simulated)`);
    }
  };
  const state = {
    authUsers: new Set([A, B]),
    accounts: new Set([A, B]),
    files: new Map<string, string>([
      ['translation-audio/req-a/answer-1.m4a', A],
      ['translation-audio/req-a/explanation-2.m4a', A],
      ['translation-audio/req-b/answer-3.m4a', B],
      ['audio/tr_reqa/primary-4.m4a', 'shared'],
    ]),
    calls: [] as { step: Step; target: string }[],
  };
  const deps = {
    getUser: async (token: string) => {
      const id = token === 'token-a' ? A : token === 'token-b' ? B : null;
      if (!id) return { error: 'invalid' as const };
      if (!state.authUsers.has(id)) return { error: 'user_not_found' as const };
      return { userId: id };
    },
    listStorageObjects: async (accountId: string) => {
      state.calls.push({ step: 'list', target: accountId });
      fail('list');
      return [...state.files.entries()]
        .filter(([path, owner]) => owner === accountId && path.startsWith('translation-audio/'))
        .map(([path]) => ({ bucket: 'translation-audio', name: path.slice('translation-audio/'.length) }));
    },
    removeStorageObjects: async (bucket: string, names: string[]) => {
      state.calls.push({ step: 'remove', target: names.join(',') });
      fail('remove');
      for (const name of names) state.files.delete(`${bucket}/${name}`);
    },
    deleteAccountData: async (accountId: string) => {
      state.calls.push({ step: 'database', target: accountId });
      fail('database');
      const existed = state.accounts.delete(accountId);
      return { accountDeleted: existed };
    },
    deleteAuthUser: async (accountId: string) => {
      state.calls.push({ step: 'auth', target: accountId });
      fail('auth');
      return state.authUsers.delete(accountId) ? ('deleted' as const) : ('not_found' as const);
    },
    log: jest.fn(),
  };
  return { deps, state };
}

const post = (body: unknown, token: string | null = 'token-a') =>
  new Request('https://fn.test/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const read = async (res: Response) => (await res.json()) as { status?: string; error?: { kind: string; message: string; step?: string } };

describe('authorization', () => {
  it.each([[null], ['not-a-real-token']])('missing or invalid JWT (%p) → 401, nothing touched', async (token) => {
    const { deps, state } = fakeBackend();
    const res = await createDeleteAccountHandler(deps)(post({ confirm: 'DELETE' }, token as string | null));

    expect(res.status).toBe(401);
    expect((await read(res)).error?.kind).toBe('unauthenticated');
    expect(state.calls).toEqual([]);
    expect(state.accounts.size).toBe(2);
  });

  it('a non-Bearer Authorization header → 401', async () => {
    const { deps, state } = fakeBackend();
    const req = new Request('https://fn.test/delete-account', {
      method: 'POST',
      headers: { Authorization: 'Basic token-a' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    expect((await createDeleteAccountHandler(deps)(req)).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it.each([
    [{ confirm: 'DELETE', userId: B }],
    [{ confirm: 'DELETE', user_id: B }],
    [{ confirm: 'DELETE', accountId: B }],
    [{ confirm: 'DELETE', account_id: B }],
    [{ confirm: 'DELETE', profileId: 'profile-b' }],
    [{ confirm: 'DELETE', email: 'b@example.com' }],
    [{ confirm: 'DELETE', admin: true }],
    [{ confirm: 'DELETE', isAdmin: true }],
    [{ confirm: 'DELETE', userId: A }],
  ])('a body that names any target (%p) is rejected — nothing is deleted', async (body) => {
    const { deps, state } = fakeBackend();
    const res = await createDeleteAccountHandler(deps)(post(body));

    expect(res.status).toBe(400);
    expect((await read(res)).error?.kind).toBe('target_not_allowed');
    expect(state.calls).toEqual([]);
    expect(state.accounts).toEqual(new Set([A, B]));
  });

  it('the typed confirmation must be exactly DELETE', async () => {
    for (const body of [{}, { confirm: 'delete' }, { confirm: 'yes' }, { confirm: true }]) {
      const { deps, state } = fakeBackend();
      const res = await createDeleteAccountHandler(deps)(post(body));
      expect(res.status).toBe(400);
      expect((await read(res)).error?.kind).toBe('confirmation_required');
      expect(state.calls).toEqual([]);
    }
  });

  it('a malformed body → 400', async () => {
    const { deps, state } = fakeBackend();
    const req = new Request('https://fn.test/delete-account', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-a' },
      body: '{nope',
    });
    expect((await createDeleteAccountHandler(deps)(req)).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it('CORS preflight is answered; other methods → 405', async () => {
    const { deps } = fakeBackend();
    const handler = createDeleteAccountHandler(deps);
    expect((await handler(new Request('https://fn.test/delete-account', { method: 'OPTIONS' }))).status).toBe(200);
    expect((await handler(new Request('https://fn.test/delete-account', { method: 'GET' }))).status).toBe(405);
  });
});

describe('deleting the caller’s own account', () => {
  it('deletes only the token’s account: its files, then its data, then its Auth user', async () => {
    const { deps, state } = fakeBackend();
    const res = await createDeleteAccountHandler(deps)(post({ confirm: 'DELETE' }));

    expect(res.status).toBe(200);
    expect(await read(res)).toEqual({ status: 'deleted' });
    expect(state.calls.map((c) => c.step)).toEqual(['list', 'remove', 'database', 'auth']);
    expect(state.calls.filter((c) => c.step !== 'remove').every((c) => c.target === A)).toBe(true);

    expect(state.authUsers).toEqual(new Set([B]));
    expect(state.accounts).toEqual(new Set([B]));
    expect([...state.files.keys()]).toEqual(['translation-audio/req-b/answer-3.m4a', 'audio/tr_reqa/primary-4.m4a']);
  });

  it('another signed-in user’s token only ever deletes that user', async () => {
    const { deps, state } = fakeBackend();
    await createDeleteAccountHandler(deps)(post({ confirm: 'DELETE' }, 'token-b'));

    expect(state.authUsers).toEqual(new Set([A]));
    expect(state.files.has('translation-audio/req-a/answer-1.m4a')).toBe(true);
  });

  it('an account with no files skips the storage removal', async () => {
    const { deps, state } = fakeBackend();
    state.files.clear();
    const res = await createDeleteAccountHandler(deps)(post({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(state.calls.map((c) => c.step)).toEqual(['list', 'database', 'auth']);
  });

  it('admins and reviewers are not blocked', async () => {
    // Roles live in the database rows delete_account_data removes; the
    // function never checks them, so they can't stop a deletion.
    const { deps } = fakeBackend();
    expect((await createDeleteAccountHandler(deps)(post({ confirm: 'DELETE' }))).status).toBe(200);
  });
});

describe('partial failures and retries', () => {
  it.each([
    ['list', 'storage'],
    ['remove', 'storage'],
    ['database', 'database'],
    ['auth', 'auth'],
  ] as const)('a failure at %s → 500 deletion_incomplete (step %s), never success; the Auth user still exists so a retry can finish', async (failing, step) => {
    const { deps, state } = fakeBackend({ failOnce: [failing] });
    const handler = createDeleteAccountHandler(deps);

    const first = await handler(post({ confirm: 'DELETE' }));
    expect(first.status).toBe(500);
    const body = await read(first);
    expect(body.status).toBeUndefined();
    expect(body.error).toMatchObject({ kind: 'deletion_incomplete', step });
    expect(state.authUsers.has(A)).toBe(true);

    const retry = await handler(post({ confirm: 'DELETE' }));
    expect(retry.status).toBe(200);
    expect(await read(retry)).toEqual({ status: 'deleted' });
    expect(state.authUsers.has(A)).toBe(false);
    expect(state.accounts.has(A)).toBe(false);
    expect([...state.files.values()].includes(A)).toBe(false);
  });

  it('later steps never run after an earlier one fails', async () => {
    const { deps, state } = fakeBackend({ failOnce: ['remove'] });
    await createDeleteAccountHandler(deps)(post({ confirm: 'DELETE' }));
    expect(state.calls.map((c) => c.step)).toEqual(['list', 'remove']);
    expect(state.accounts.has(A)).toBe(true);
  });

  it('a retry after the data step already succeeded is fine (database step is a no-op)', async () => {
    const { deps, state } = fakeBackend({ failOnce: ['auth'] });
    const handler = createDeleteAccountHandler(deps);
    await handler(post({ confirm: 'DELETE' }));
    expect(state.accounts.has(A)).toBe(false);

    expect((await handler(post({ confirm: 'DELETE' }))).status).toBe(200);
  });

  it('a retry after everything already succeeded (lost response) is reported as already deleted, touching nothing', async () => {
    const { deps, state } = fakeBackend();
    const handler = createDeleteAccountHandler(deps);
    await handler(post({ confirm: 'DELETE' }));
    state.calls.length = 0;

    const again = await handler(post({ confirm: 'DELETE' }));
    expect(again.status).toBe(200);
    expect(await read(again)).toEqual({ status: 'already_deleted' });
    expect(state.calls).toEqual([]);
  });

  it('the Auth user already gone by the time step 3 runs counts as done', async () => {
    const { deps, state } = fakeBackend();
    const handler = createDeleteAccountHandler({
      ...deps,
      deleteAuthUser: async (id: string) => {
        state.authUsers.delete(id);
        return 'not_found' as const;
      },
    });
    expect(await read(await handler(post({ confirm: 'DELETE' })))).toEqual({ status: 'deleted' });
  });

  it('a persistent failure keeps failing — it never turns into success', async () => {
    const { deps, state } = fakeBackend({ failAlways: ['auth'] });
    const handler = createDeleteAccountHandler(deps);
    for (let i = 0; i < 3; i++) {
      const res = await handler(post({ confirm: 'DELETE' }));
      expect(res.status).toBe(500);
    }
    expect(state.authUsers.has(A)).toBe(true);
    expect(deps.log).toHaveBeenCalled();
  });
});
