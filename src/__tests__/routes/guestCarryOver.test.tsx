// Carry-over at sign-up, after the profile is created, when this device holds
// guest-preview data:
// - the items the guest used are always recorded on the new account (so the
//   free total includes them) — whatever the learner chooses next;
// - practice results and saved words move to the profile only if the learner
//   says yes; "Not now" clears them from the device;
// - if moving them fails, the device keeps them, an error says so and the
//   learner can retry (or skip, which clears);
// - when done, guest mode and the preview's device keys are cleared.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockStore = new Map<string, string>();
const mockImportClaims = jest.fn();
const mockRecord = jest.fn();
const mockAddFavorite = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
const mockEndGuest = jest.fn(async () => undefined);
const GUEST_DATA = {
  claims: { lesson: ['l1', 'l2'], proverb: ['p1'] },
  results: { w1: { correct: 2, incorrect: 0, lastSeenAt: 'x' }, w2: { correct: 0, incorrect: 1, lastSeenAt: 'x' } },
  favorites: ['w1'],
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
    getAllKeys: jest.fn(async () => [...mockStore.keys()]),
    multiRemove: jest.fn(async (keys: string[]) => keys.forEach((k) => mockStore.delete(k))),
  },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
const mockProfile = { activeProfile: { id: 'p-new' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: 'free', isResolved: true, refresh: mockRefresh }) }));
jest.mock('@/lib/guest/GuestContext', () => ({ useGuest: () => ({ isGuest: false, endGuest: mockEndGuest }) }));
jest.mock('@/data/featureClaims', () => ({ importGuestClaims: (...a: unknown[]) => mockImportClaims(...a) }));
jest.mock('@/data/progress', () => ({ recordWordGroupResult: (...a: unknown[]) => mockRecord(...a) }));
jest.mock('@/data/favorites', () => ({ addFavorite: (...a: unknown[]) => mockAddFavorite(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CarryOver = require('../../../app/guest/carry-over').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GUEST_DATA_STORAGE_KEY } = require('@/lib/localStorageKeys');

const renderScreen = () => render(<ThemeProvider><CarryOver /></ThemeProvider>);

beforeEach(() => {
  mockStore.clear();
  mockStore.set(GUEST_DATA_STORAGE_KEY, JSON.stringify(GUEST_DATA));
  mockStore.set('learn-tunisian.phrasebook-progress.guest', '["x"]');
  mockStore.set('learn-tunisian.alphabet-progress.p-other', 'keep');
  mockReplace.mockReset();
  mockImportClaims.mockReset().mockResolvedValue(3);
  mockRecord.mockReset().mockResolvedValue(undefined);
  mockAddFavorite.mockReset().mockResolvedValue(undefined);
  mockRefresh.mockClear();
  mockEndGuest.mockClear();
});

it('always records the used items on the account first, then asks about progress', async () => {
  await renderScreen();
  expect(await screen.findByText(/bring your preview progress/i)).toBeOnTheScreen();
  expect(mockImportClaims).toHaveBeenCalledWith([
    { feature: 'lesson', item_key: 'l1' },
    { feature: 'lesson', item_key: 'l2' },
    { feature: 'proverb', item_key: 'p1' },
  ]);
  expect(mockRefresh).toHaveBeenCalled();
  expect(mockRecord).not.toHaveBeenCalled();
});

it('yes: results and saved words move to the new profile; then the device is cleared', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByRole('button', { name: 'Add my preview progress' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
  expect(mockRecord).toHaveBeenCalledWith('p-new', 'w1', true);
  expect(mockRecord).toHaveBeenCalledWith('p-new', 'w2', false);
  expect(mockAddFavorite).toHaveBeenCalledWith('p-new', 'w1');
  expect(mockStore.has(GUEST_DATA_STORAGE_KEY)).toBe(false);
  expect(mockStore.has('learn-tunisian.phrasebook-progress.guest')).toBe(false);
  expect(mockStore.get('learn-tunisian.alphabet-progress.p-other')).toBe('keep');
  expect(mockEndGuest).toHaveBeenCalled();
});

it('not now: nothing moves to the profile, the device is cleared (the used items stay recorded)', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
  expect(mockRecord).not.toHaveBeenCalled();
  expect(mockAddFavorite).not.toHaveBeenCalled();
  expect(mockImportClaims).toHaveBeenCalled();
  expect(mockStore.has(GUEST_DATA_STORAGE_KEY)).toBe(false);
});

it('moving progress fails: the device keeps it, an error says so, and retry works', async () => {
  mockAddFavorite.mockRejectedValueOnce(new Error('offline'));
  await renderScreen();
  await fireEvent.press(await screen.findByRole('button', { name: 'Add my preview progress' }));
  expect(await screen.findByText(/couldn.t bring your progress over/i)).toBeOnTheScreen();
  expect(mockStore.has(GUEST_DATA_STORAGE_KEY)).toBe(true);
  expect(mockReplace).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
  expect(mockStore.has(GUEST_DATA_STORAGE_KEY)).toBe(false);
});

it('recording the used items fails: an error with retry; nothing is cleared', async () => {
  mockImportClaims.mockRejectedValueOnce(new Error('offline'));
  await renderScreen();
  expect(await screen.findByText(/couldn.t bring your progress over/i)).toBeOnTheScreen();
  expect(mockStore.has(GUEST_DATA_STORAGE_KEY)).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/bring your preview progress/i)).toBeOnTheScreen();
});
