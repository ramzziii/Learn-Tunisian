// Profile → Account → "Change password": sends the existing password-reset
// link to the signed-in account's email (no separate auth mechanism).
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
  mockEmail = 'ramzi@example.com';
  mockSendPasswordReset.mockReset().mockResolvedValue({ error: null });
  mockSignOut.mockReset().mockResolvedValue(undefined);
});

it('"Change password" sits in the Account section, next to Sign out', async () => {
  await renderProfile();
  await screen.findByText('Change password');

  const texts = textsInOrder();
  const account = texts.indexOf('Account');
  expect(account).toBeGreaterThan(-1);
  expect(texts.indexOf('Change password')).toBeGreaterThan(account);
  expect(texts.indexOf('Sign out')).toBeGreaterThan(account);
});

it('tapping it sends the existing reset link to the signed-in account’s email — no email to re-type', async () => {
  await renderProfile();

  await fireEvent.press(await screen.findByText('Change password'));

  expect(mockSendPasswordReset).toHaveBeenCalledWith('ramzi@example.com');
  expect(screen.queryByPlaceholderText(/email/i)).toBeNull();
});

it('confirms only after the request succeeds, and says to follow the emailed link', async () => {
  let confirmationShownDuringRequest: boolean | null = null;
  mockSendPasswordReset.mockImplementation(async () => {
    confirmationShownDuringRequest = screen.queryByText(/Check your email/) !== null;
    return { error: null };
  });
  await renderProfile();

  await fireEvent.press(await screen.findByText('Change password'));

  expect(confirmationShownDuringRequest).toBe(false);
  expect(await screen.findByText(/Check your email/)).toBeOnTheScreen();
  expect(screen.getByText(/6-digit code to ramzi@example\.com/)).toBeOnTheScreen();
  // Straight on to entering the code (no email link to follow).
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/auth/reset-code', params: { email: 'ramzi@example.com' } });
});

it('a failed request shows the error, no confirmation, and can be retried', async () => {
  mockSendPasswordReset
    .mockResolvedValueOnce({ error: 'For security purposes, you can only request this once every 60 seconds' })
    .mockResolvedValueOnce({ error: null });
  await renderProfile();

  await fireEvent.press(await screen.findByText('Change password'));
  expect(await screen.findByText(/only request this once every 60 seconds/)).toBeOnTheScreen();
  expect(screen.queryByText(/Check your email/)).toBeNull();

  await fireEvent.press(screen.getByText('Change password'));
  expect(mockSendPasswordReset).toHaveBeenCalledTimes(2);
  expect(await screen.findByText(/Check your email/)).toBeOnTheScreen();
  expect(screen.queryByText(/only request this once every 60 seconds/)).toBeNull();
});

it('a request that throws (e.g. offline) is shown as an error too', async () => {
  mockSendPasswordReset.mockRejectedValue(new Error('Network request failed'));
  await renderProfile();

  await fireEvent.press(await screen.findByText('Change password'));

  expect(await screen.findByText(/Couldn.t send the reset email/)).toBeOnTheScreen();
  expect(screen.queryByText(/Check your email/)).toBeNull();
});

it('while sending, the button shows progress instead of its label (no second tap target)', async () => {
  let labelDuringRequest: unknown = 'not checked';
  mockSendPasswordReset.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 0));
    labelDuringRequest = screen.queryByText('Change password');
    return { error: null };
  });
  await renderProfile();

  await fireEvent.press(await screen.findByText('Change password'));

  expect(labelDuringRequest).toBeNull();
  expect(mockSendPasswordReset).toHaveBeenCalledTimes(1);
});

it('no email on the account: explains it and sends nothing', async () => {
  mockEmail = undefined;
  await renderProfile();

  await fireEvent.press(await screen.findByText('Change password'));

  expect(mockSendPasswordReset).not.toHaveBeenCalled();
  expect(await screen.findByText(/no email address/i)).toBeOnTheScreen();
});

it('Sign out still asks to confirm, as before', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderProfile();

  await fireEvent.press(await screen.findByText('Sign out'));

  expect(alertSpy).toHaveBeenCalledWith('Sign out?', expect.any(String), expect.any(Array));
  expect(mockSendPasswordReset).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

it('the rest of Profile is unchanged (settings sections still render)', async () => {
  await renderProfile();
  expect(await screen.findByText('Appearance')).toBeOnTheScreen();
  expect(screen.getByText('Daily goal')).toBeOnTheScreen();
  expect(screen.getByText('[translation requests entry]')).toBeOnTheScreen();
});
