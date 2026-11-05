// The admin "View app as Premium" switch on Profile, end to end with the real
// PremiumProvider, AccessProvider and Profile screen (only the account,
// network and device storage are faked):
// - an admin sees the full Premium app by default;
// - switching it off shows exactly the free plan: free limits apply (5
//   items), counted only on this device — the server is never asked;
// - "Reset free-plan limits" clears only those preview counts;
// - switching it back on opens everything again at once;
// - the choice survives a restart;
// - a non-admin has no switch, and a stored preview never grants Premium.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';
import { useState } from 'react';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));

let mockIsAdmin = true;
const mockProfile = { id: 'p1', name: 'Ramzi', isPremium: false };
const mockFetchClaims = jest.fn(async () => ({}));
const mockClaimItem = jest.fn(async () => true);

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/admin/AdminContext', () => ({ useIsAdmin: () => ({ isAdmin: mockIsAdmin, isLoading: false }) }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ activeProfile: mockProfile, profiles: [mockProfile] }),
}));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn(), session: { user: { id: 'acc-1' } } }) }));
jest.mock('@/lib/guest/GuestContext', () => ({ useGuest: () => ({ isGuest: false }) }));
jest.mock('@/data/featureClaims', () => ({
  fetchMyClaims: (...a: unknown[]) => mockFetchClaims(...(a as [])),
  claimFeatureItem: (...a: unknown[]) => mockClaimItem(...(a as [])),
}));
jest.mock('@/lib/search/searchIndexCache', () => ({ clearSearchIndex: jest.fn() }));
jest.mock('@/lib/notifications/reminders', () => ({
  cancelDailyReminder: jest.fn(),
  requestNotificationPermission: jest.fn(async () => true),
  scheduleDailyReminder: jest.fn(),
}));
jest.mock('@/data/profiles', () => ({
  fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 10, reminderEnabled: false, reminderTime: '18:00:00' })),
  updateDailyGoalSettings: jest.fn(),
}));
jest.mock('@/data/progress', () => ({
  fetchProgressSummary: jest.fn(async () => ({ wordsLearning: 1, wordsMastered: 2, wordsReviewed: 3, totalWordsSeen: 4 })),
}));
jest.mock('@/data/content', () => ({ countCompletedLessons: jest.fn(async () => 1) }));
jest.mock('@/components/translation/TranslationRequestsEntry', () => ({ TranslationRequestsEntry: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProfileScreen = require('../../../app/(tabs)/profile').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PremiumProvider } = require('@/lib/premium/PremiumContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AccessProvider, useAccess } = require('@/lib/access/AccessContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_PREVIEW_STORAGE_KEY } = require('@/lib/localStorageKeys');

/** What a learner screen sees: the tier, and whether 6 new lessons would open. */
function LearnerProbe() {
  const { tier, isResolved, open } = useAccess();
  const [opened, setOpened] = useState<string>('');
  if (!isResolved) return <Text>access loading</Text>;
  return (
    <>
      <Text>{`tier: ${tier}`}</Text>
      {(['l', 'm'] as const).map((prefix) => (
        <Pressable
          key={prefix}
          accessibilityRole="button"
          onPress={async () => {
            const results: boolean[] = [];
            for (let i = 1; i <= 6; i++) results.push(await open('lesson', `${prefix}${i}`));
            setOpened(results.map((ok) => (ok ? 'open' : 'locked')).join(','));
          }}
        >
          <Text>{prefix === 'l' ? 'Open 6 lessons' : 'Open 6 other lessons'}</Text>
        </Pressable>
      ))}
      {opened ? <Text>{`lessons: ${opened}`}</Text> : null}
    </>
  );
}

const renderApp = () =>
  render(
    <ThemeProvider>
      <PremiumProvider>
        <AccessProvider>
          <LearnerProbe />
          <ProfileScreen />
        </AccessProvider>
      </PremiumProvider>
    </ThemeProvider>
  );
const toggle = () => screen.findByLabelText('View app as Premium');

beforeEach(() => {
  mockStore.clear();
  mockIsAdmin = true;
  mockFetchClaims.mockClear();
  mockClaimItem.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('an admin sees the full Premium app by default', async () => {
  await renderApp();
  expect(await screen.findByText('tier: premium')).toBeOnTheScreen();
  expect((await toggle()).props.value).toBe(true);
  expect(screen.getByText(/Showing the full Premium app/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Open 6 lessons'));
  expect(await screen.findByText('lessons: open,open,open,open,open,open')).toBeOnTheScreen();
});

it('switching it off shows the free plan: 5 items, counted on this device only — the server is never asked', async () => {
  await renderApp();
  await fireEvent(await toggle(), 'valueChange', false);

  expect(await screen.findByText('tier: free')).toBeOnTheScreen();
  expect(screen.getByText(/Viewing as a new free user/)).toBeOnTheScreen();
  expect(screen.getByText('👀 Viewing as a free user · Switch in Profile')).toBeOnTheScreen();
  expect(screen.getByText('Lessons used in this preview: 0 of 5')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Open 6 lessons'));
  expect(await screen.findByText('lessons: open,open,open,open,open,locked')).toBeOnTheScreen();
  expect(screen.getByText('Lessons used in this preview: 5 of 5')).toBeOnTheScreen();
  expect(mockFetchClaims).not.toHaveBeenCalled();
  expect(mockClaimItem).not.toHaveBeenCalled();
  expect(mockStore.get(ADMIN_PREVIEW_STORAGE_KEY)).toBe('free');
});

it('"Reset free-plan limits" clears only the preview counts', async () => {
  await renderApp();
  await fireEvent(await toggle(), 'valueChange', false);
  await screen.findByText('tier: free');
  await fireEvent.press(screen.getByText('Open 6 lessons'));
  await screen.findByText('lessons: open,open,open,open,open,locked');

  // Allowance used up: six different lessons are all locked.
  await fireEvent.press(screen.getByText('Open 6 other lessons'));
  expect(await screen.findByText('lessons: locked,locked,locked,locked,locked,locked')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Reset free-plan limits'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Free-plan preview reset', expect.any(String)));
  // After the reset, five new items are available again.
  await fireEvent.press(screen.getByText('Open 6 other lessons'));
  expect(await screen.findByText('lessons: open,open,open,open,open,locked')).toBeOnTheScreen();
  expect(mockClaimItem).not.toHaveBeenCalled();
});

it('switching it back on opens everything again at once', async () => {
  await renderApp();
  await fireEvent(await toggle(), 'valueChange', false);
  await screen.findByText('tier: free');
  await fireEvent(await toggle(), 'valueChange', true);

  expect(await screen.findByText('tier: premium')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Open 6 lessons'));
  expect(await screen.findByText('lessons: open,open,open,open,open,open')).toBeOnTheScreen();
  expect(mockStore.get(ADMIN_PREVIEW_STORAGE_KEY)).toBe('premium');
});

it('the choice survives a restart', async () => {
  mockStore.set(ADMIN_PREVIEW_STORAGE_KEY, 'free');
  await renderApp();
  expect(await screen.findByText('tier: free')).toBeOnTheScreen();
  expect((await toggle()).props.value).toBe(false);
});

it('a non-admin has no switch, and a stored preview never grants Premium', async () => {
  mockIsAdmin = false;
  mockStore.set(ADMIN_PREVIEW_STORAGE_KEY, 'premium');
  await renderApp();
  expect(await screen.findByText('tier: free')).toBeOnTheScreen();
  expect(screen.queryByLabelText('View app as Premium')).toBeNull();
});
