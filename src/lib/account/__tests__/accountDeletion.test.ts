// Client side of account deletion:
// - the typed confirmation;
// - asking the delete-account Edge Function (never sending a target — the
//   server derives it from the session) and reading its answer, never
//   treating a failure as deleted;
// - clearing ONLY this account's local data afterwards: its profiles'
//   reminders, per-profile saved progress, cached tutor speech and the
//   active-profile choice — not shared lesson audio, device settings, or
//   another account's data on the same device.
const mockInvoke = jest.fn();
const mockSignOut = jest.fn();
const mockStore = new Map<string, string>();
const mockScheduled: { identifier: string; content: { data: Record<string, unknown> } }[] = [];
const mockCancelled: string[] = [];
const mockCacheFiles: { name: string; deleted: boolean }[] = [];
let mockNotificationsFail = false;

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    auth: { signOut: (...a: unknown[]) => mockSignOut(...a) },
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    getAllKeys: async () => [...mockStore.keys()],
    multiRemove: async (keys: string[]) => keys.forEach((k) => mockStore.delete(k)),
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: async () => {
    if (mockNotificationsFail) throw new Error('notifications unavailable');
    return mockScheduled;
  },
  cancelScheduledNotificationAsync: async (id: string) => void mockCancelled.push(id),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));
jest.mock('expo-file-system', () => ({
  Paths: {
    cache: {
      list: () =>
        mockCacheFiles
          .filter((f) => !f.deleted)
          .map((f) => ({
            name: f.name,
            delete: () => {
              f.deleted = true;
            },
          })),
    },
  },
  File: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isDeleteConfirmation, requestAccountDeletion } = require('@/data/accountDeletion');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { clearLocalAccountData } = require('@/lib/account/localAccountCleanup');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { completeAccountDeletion } = require('@/lib/account/deleteAccount');

const P1 = '11111111-1111-1111-1111-111111111111'; // this account's profile
const P2 = '22222222-2222-2222-2222-222222222222'; // another account on this device

function seedDevice() {
  mockStore.clear();
  for (const feature of ['alphabet-progress', 'daily-challenge-progress', 'phrasebook-progress', 'free-allowance', 'proverb-progress', 'repeat-after-me-progress']) {
    mockStore.set(`learn-tunisian.${feature}.${P1}`, '{}');
    mockStore.set(`learn-tunisian.${feature}.${P2}`, '{}');
  }
  mockStore.set(`reminder-notification-id:${P1}`, 'n1');
  mockStore.set('learn-tunisian.active-profile-id', P1);
  mockStore.set('learn-tunisian.theme-preference', 'dark');
  mockStore.set('learn-tunisian.admin-premium-preview', 'free');
  mockStore.set('sb-project-auth-token', '{"session":"..."}');

  mockScheduled.length = 0;
  mockScheduled.push(
    { identifier: 'n1', content: { data: { profileId: P1 } } },
    { identifier: 'n2', content: { data: { profileId: P2 } } }
  );
  mockCancelled.length = 0;

  mockCacheFiles.length = 0;
  mockCacheFiles.push(
    { name: `tutor-speech-${P1}-1700000000000.mp3`, deleted: false },
    { name: `tutor-speech-${P2}-1700000000001.mp3`, deleted: false },
    { name: 'audio-cache', deleted: false }
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  seedDevice();
});

describe('typed confirmation', () => {
  it.each([
    ['DELETE', true],
    ['  DELETE ', true],
    ['delete', false],
    ['Delete', false],
    ['DELET', false],
    ['DELETE ME', false],
    ['', false],
  ])('%p → %p', (text, ok) => {
    expect(isDeleteConfirmation(text)).toBe(ok);
  });
});

describe('requestAccountDeletion', () => {
  it('sends only the confirmation — no user, account or profile id', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'deleted' }, error: null });
    await expect(requestAccountDeletion()).resolves.toEqual({ ok: true, status: 'deleted' });
    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: { confirm: 'DELETE' } });
  });

  it('already deleted by an earlier attempt counts as done', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'already_deleted' }, error: null });
    await expect(requestAccountDeletion()).resolves.toEqual({ ok: true, status: 'already_deleted' });
  });

  it('a server failure is not reported as deleted, and carries the server’s message', async () => {
    const context = {
      json: async () => ({ error: { kind: 'deletion_incomplete', step: 'auth', message: 'Your data was removed, but your account couldn’t be closed yet. Please try again to finish.' } }),
    };
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    await expect(requestAccountDeletion()).resolves.toEqual({
      ok: false,
      message: 'Your data was removed, but your account couldn’t be closed yet. Please try again to finish.',
    });
  });

  it('a network failure (outcome unknown) is not reported as deleted either', async () => {
    mockInvoke.mockRejectedValue(new Error('Network request failed'));
    const result = await requestAccountDeletion();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/try again/i);
  });

  it('an unexpected success body is not trusted', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect((await requestAccountDeletion()).ok).toBe(false);
  });
});

describe('clearLocalAccountData', () => {
  it('removes this account’s reminders, per-profile data, active profile and cached tutor speech', async () => {
    await clearLocalAccountData({ profileIds: [P1], wasAdmin: false });

    expect(mockCancelled).toEqual(['n1']);
    expect([...mockStore.keys()].filter((k) => k.includes(P1))).toEqual([]);
    expect(mockStore.has('learn-tunisian.active-profile-id')).toBe(false);
    expect(mockCacheFiles.find((f) => f.name.includes(P1))!.deleted).toBe(true);
  });

  it('leaves another account’s data, shared audio and device settings alone', async () => {
    await clearLocalAccountData({ profileIds: [P1], wasAdmin: false });

    expect([...mockStore.keys()].filter((k) => k.includes(P2))).toHaveLength(6);
    expect(mockCancelled).not.toContain('n2');
    expect(mockCacheFiles.find((f) => f.name.includes(P2))!.deleted).toBe(false);
    expect(mockCacheFiles.find((f) => f.name === 'audio-cache')!.deleted).toBe(false);
    expect(mockStore.get('learn-tunisian.theme-preference')).toBe('dark');
    expect(mockStore.get('learn-tunisian.admin-premium-preview')).toBe('free'); // not an admin
  });

  it('the active-profile choice is only cleared if it was this account’s', async () => {
    mockStore.set('learn-tunisian.active-profile-id', P2);
    await clearLocalAccountData({ profileIds: [P1], wasAdmin: false });
    expect(mockStore.get('learn-tunisian.active-profile-id')).toBe(P2);
  });

  it('an admin’s “view as” preview setting is cleared too', async () => {
    await clearLocalAccountData({ profileIds: [P1], wasAdmin: true });
    expect(mockStore.has('learn-tunisian.admin-premium-preview')).toBe(false);
  });

  it('one failing step doesn’t stop the others, and is reported', async () => {
    mockNotificationsFail = true;
    const result = await clearLocalAccountData({ profileIds: [P1], wasAdmin: false });
    mockNotificationsFail = false;

    expect(result.failures).toEqual(['reminders']);
    expect([...mockStore.keys()].filter((k) => k.includes(P1))).toEqual([]);
  });
});

describe('completeAccountDeletion', () => {
  it('on success: clears local data, then signs out locally', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'deleted' }, error: null });
    const result = await completeAccountDeletion({ profileIds: [P1], wasAdmin: false });

    expect(result).toEqual({ ok: true });
    expect(mockStore.has(`learn-tunisian.alphabet-progress.${P1}`)).toBe(false);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('on failure: nothing local is cleared and the user stays signed in', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: { kind: 'deletion_incomplete', message: 'Please try again.' } }) } },
    });
    const result = await completeAccountDeletion({ profileIds: [P1], wasAdmin: false });

    expect(result).toEqual({ ok: false, message: 'Please try again.' });
    expect(mockStore.has(`learn-tunisian.alphabet-progress.${P1}`)).toBe(true);
    expect(mockCancelled).toEqual([]);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('local cleanup trouble never turns a server-side deletion into a failure', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'deleted' }, error: null });
    mockSignOut.mockRejectedValue(new Error('storage locked'));
    expect(await completeAccountDeletion({ profileIds: [P1], wasAdmin: false })).toEqual({ ok: true });
  });
});
