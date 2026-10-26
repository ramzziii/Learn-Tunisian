// Profile tab: admins get a clear "Admin dashboard" entry near the top;
// everyone else never sees it.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockIsAdmin = true;
const mockProfile = { id: 'p1', name: 'Ramzi', track: 'adult', isPremium: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ activeProfile: mockProfile, profiles: [mockProfile] }),
}));
jest.mock('@/lib/admin/AdminContext', () => ({ useIsAdmin: () => ({ isAdmin: mockIsAdmin, isLoading: false }) }));
jest.mock('@/lib/premium/PremiumContext', () => ({
  usePremium: () => ({ isPremium: mockIsAdmin, isResolved: true, isAdmin: mockIsAdmin, adminPreview: 'premium', setAdminPreview: jest.fn() }),
}));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn(), session: { user: { id: 'a1' } } }) }));
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
jest.mock('@/components/translation/TranslationRequestsEntry', () => ({
  TranslationRequestsEntry: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>[translation requests entry]</Text>;
  },
}));
jest.mock('@/data/content', () => ({ countCompletedLessons: jest.fn(async () => 1) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProfileScreen = require('../../../app/(tabs)/profile').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderProfile = () =>
  render(
    <ThemeProvider>
      <ProfileScreen />
    </ThemeProvider>
  );

beforeEach(() => {
  mockPush.mockReset();
  mockIsAdmin = true;
});

it('admin: an "Admin dashboard" entry near the top opens the dashboard', async () => {
  await renderProfile();

  const entry = await screen.findByText('Admin dashboard');
  // Above the first settings section, so it's visible without scrolling.
  const texts = screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join(''));
  expect(texts.indexOf('Admin dashboard')).toBeLessThan(texts.indexOf('Appearance'));

  await fireEvent.press(entry);
  expect(mockPush).toHaveBeenCalledWith('/admin');
});

it('admin: the Premium preview switch is still there', async () => {
  await renderProfile();
  expect(await screen.findByLabelText('View app as Premium')).toBeOnTheScreen();
});

it('non-admin: no admin entry at all', async () => {
  mockIsAdmin = false;
  await renderProfile();

  await screen.findByText('Appearance');
  expect(screen.queryByText('Admin dashboard')).toBeNull();
  expect(screen.queryByText('Content Admin')).toBeNull();
});
