// Profile → Account → "Delete account": a clearly labelled entry in the
// Account section that opens the confirmation screen — it never deletes
// anything by itself. Sign out and Change password are unchanged.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSendPasswordReset = jest.fn();
const mockSignOut = jest.fn();
let mockEmail: string | undefined = 'ramzi@example.com';
const mockProfile = { id: 'p1', name: 'Ramzi', isPremium: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ activeProfile: mockProfile, profiles: [mockProfile] }),
}));
jest.mock('@/lib/admin/AdminContext', () => ({ useIsAdmin: () => ({ isAdmin: false, isLoading: false }) }));
jest.mock('@/lib/premium/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false, isResolved: true, isAdmin: false, adminPreview: 'premium', setAdminPreview: jest.fn() }),
}));
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'a1', email: mockEmail } },
    signOut: (...a: unknown[]) => mockSignOut(...a),
    sendPasswordReset: (...a: unknown[]) => mockSendPasswordReset(...a),
  }),
}));
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

const textsInOrder = () => screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join(''));

beforeEach(() => {
  mockPush.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockSendPasswordReset.mockReset().mockResolvedValue({ error: null });
});

it('"Delete account" is in the Account section, after Sign out', async () => {
  await renderProfile();
  await screen.findByText('Delete account');

  const texts = textsInOrder();
  const account = texts.indexOf('Account');
  expect(account).toBeGreaterThan(-1);
  expect(texts.indexOf('Sign out')).toBeGreaterThan(account);
  expect(texts.indexOf('Delete account')).toBeGreaterThan(texts.indexOf('Sign out'));
});

it('opens the confirmation screen and does nothing else', async () => {
  await renderProfile();
  await fireEvent.press(await screen.findByText('Delete account'));

  expect(mockPush).toHaveBeenCalledWith('/account/delete');
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('it is announced as a button with a clear label', async () => {
  await renderProfile();
  expect(await screen.findByRole('button', { name: 'Delete account' })).toBeOnTheScreen();
});

it('Sign out still asks first, then signs out (regression)', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderProfile();
  await fireEvent.press(await screen.findByText('Sign out'));

  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await buttons.find((b) => b.text === 'Sign out')!.onPress!();
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

it('Change password is unchanged (regression)', async () => {
  await renderProfile();
  await fireEvent.press(await screen.findByText('Change password'));
  expect(mockSendPasswordReset).toHaveBeenCalledWith('ramzi@example.com');
});
