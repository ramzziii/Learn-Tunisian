// ActiveProfileContext:
// - in the guest preview (signed out), screens get a device-only guest profile
//   (id "guest", never Premium) so the normal screens work — nothing on the server;
// - signed in, the profile (and so is_premium) is read again whenever the app
//   comes back to the foreground, so a Premium change isn't stale.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
let mockSession: { user: { id: string } } | null = { user: { id: 'acc-1' } };
let mockIsGuest = false;
const mockListProfiles = jest.fn();
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock('@/lib/guest/GuestContext', () => ({ useGuest: () => ({ isGuest: mockIsGuest }) }));
jest.mock('@/data/profiles', () => ({ listProfiles: (...a: unknown[]) => mockListProfiles(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ActiveProfileProvider, useActiveProfile, GUEST_PROFILE_ID } = require('@/lib/account/ActiveProfileContext');

const wrapper = ({ children }: { children: ReactNode }) => <ActiveProfileProvider>{children}</ActiveProfileProvider>;
const profile = (isPremium: boolean) => ({ id: 'p1', accountId: 'acc-1', name: 'Sam', isPremium });

let appStateListener: ((s: string) => void) | null = null;
beforeEach(() => {
  mockSession = { user: { id: 'acc-1' } };
  mockIsGuest = false;
  mockListProfiles.mockReset();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

it('guest preview: a device-only guest profile, never Premium, no server reads', async () => {
  mockSession = null;
  mockIsGuest = true;
  const { result } = await renderHook(() => useActiveProfile(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.activeProfile).toMatchObject({ id: GUEST_PROFILE_ID, isPremium: false });
  expect(result.current.profiles).toEqual([]);
  expect(mockListProfiles).not.toHaveBeenCalled();
});

it('signed out and not a guest: no profile', async () => {
  mockSession = null;
  const { result } = await renderHook(() => useActiveProfile(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.activeProfile).toBeNull();
});

it('coming back to the foreground re-reads the profile, so is_premium is fresh', async () => {
  mockListProfiles.mockResolvedValueOnce([profile(false)]).mockResolvedValue([profile(true)]);
  const { result } = await renderHook(() => useActiveProfile(), { wrapper });
  await waitFor(() => expect(result.current.activeProfile?.isPremium).toBe(false));
  await act(async () => appStateListener?.('active'));
  await waitFor(() => expect(result.current.activeProfile?.isPremium).toBe(true));
  expect(mockListProfiles).toHaveBeenCalledTimes(2);
});

it('going to the background doesn’t re-read', async () => {
  mockListProfiles.mockResolvedValue([profile(false)]);
  await renderHook(() => useActiveProfile(), { wrapper });
  await waitFor(() => expect(mockListProfiles).toHaveBeenCalledTimes(1));
  await act(async () => appStateListener?.('background'));
  expect(mockListProfiles).toHaveBeenCalledTimes(1);
});
