// Profile → Daily goal & Daily reminder, after signup: the goal can be
// changed, a skipped reminder can be turned on later (asking for permission
// then, and saying so if it's denied), and a reminder can be turned off.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockCancel = jest.fn();
const mockPermission = jest.fn();
const mockSchedule = jest.fn();
const mockUpdateSettings = jest.fn();
let mockSettings: Record<string, unknown> = { dailyGoalMinutes: 10, reminderEnabled: false, reminderTime: '18:00:00' };
jest.mock('@/components/onboarding/TimeWheelPicker', () => ({
  TimeWheelPicker: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>[time picker]</Text>;
  },
}));

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
  cancelDailyReminder: (...a: unknown[]) => mockCancel(...a),
  requestNotificationPermission: (...a: unknown[]) => mockPermission(...a),
  scheduleDailyReminder: (...a: unknown[]) => mockSchedule(...a),
}));
jest.mock('@/data/profiles', () => ({
  fetchDailyGoalSettings: jest.fn(async () => mockSettings),
  updateDailyGoalSettings: (...a: unknown[]) => mockUpdateSettings(...a),
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
  [mockCancel, mockPermission, mockSchedule, mockUpdateSettings].forEach((m) => m.mockReset());
  mockUpdateSettings.mockResolvedValue(undefined);
  mockSettings = { dailyGoalMinutes: 10, reminderEnabled: false, reminderTime: '18:00:00' };
});

const reminderSwitch = () => screen.getByLabelText('Daily reminder');

it('a reminder skipped at signup shows as off, without a time picker', async () => {
  await renderProfile();
  await screen.findByText('Save changes');
  expect(reminderSwitch().props.value).toBe(false);
  expect(screen.queryByText('[time picker]')).toBeNull();
});

it('turning it on later asks for permission then, and schedules it', async () => {
  mockPermission.mockResolvedValue(true);
  await renderProfile();
  await screen.findByText('Save changes');
  await fireEvent(reminderSwitch(), 'valueChange', true);
  expect(screen.getByText('[time picker]')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Save changes'));

  expect(mockUpdateSettings).toHaveBeenCalledWith('p1', expect.objectContaining({ reminderEnabled: true, reminderTime: '18:00:00' }));
  expect(mockPermission).toHaveBeenCalledTimes(1);
  expect(mockSchedule).toHaveBeenCalledWith('p1', '18:0');
});

it('if permission is denied, it says so and schedules nothing', async () => {
  mockPermission.mockResolvedValue(false);
  await renderProfile();
  await screen.findByText('Save changes');
  await fireEvent(reminderSwitch(), 'valueChange', true);
  await fireEvent.press(screen.getByText('Save changes'));

  expect(mockSchedule).not.toHaveBeenCalled();
  expect(screen.getByText(/notifications are turned off/i)).toBeOnTheScreen();
});

it('turning a reminder off cancels it', async () => {
  mockSettings = { dailyGoalMinutes: 10, reminderEnabled: true, reminderTime: '07:30:00' };
  await renderProfile();
  await screen.findByText('Save changes');
  await fireEvent(reminderSwitch(), 'valueChange', false);
  await fireEvent.press(screen.getByText('Save changes'));

  expect(mockUpdateSettings).toHaveBeenCalledWith('p1', expect.objectContaining({ reminderEnabled: false }));
  expect(mockCancel).toHaveBeenCalledWith('p1');
  expect(mockPermission).not.toHaveBeenCalled();
});

it('the daily goal can still be changed after signup', async () => {
  await renderProfile();
  await screen.findByText('Save changes');
  await fireEvent.press(screen.getByText('15 minutes a day'));
  await fireEvent.press(screen.getByText('Save changes'));
  expect(mockUpdateSettings).toHaveBeenCalledWith('p1', expect.objectContaining({ dailyGoalMinutes: 15 }));
});
