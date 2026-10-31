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
let mockIsAdmin = false;
jest.mock('@/lib/admin/AdminContext', () => ({ useIsAdmin: () => ({ isAdmin: mockIsAdmin, isLoading: false }) }));
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
  mockIsAdmin = false;
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

// Profile → About links to the "Why Tunisian, not MSA?" explanation.
it('About opens “Why Tunisian, not MSA?”', async () => {
  await renderProfile();
  await screen.findByText('Save changes');
  expect(screen.getByText('About')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Why Tunisian, not MSA?'));
  expect(mockPush).toHaveBeenCalledWith('/why-tunisian');
});

// Profile is settings only: grouped under clear headings, with Favorites and
// Translation requests moved out (Flashcards → Saved words, Learn → Ask for
// a translation). The admin entry stays admin-only, at the top.
describe('Profile layout', () => {
  const texts = () => screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join(''));

  it('settings grouped in order: Daily goal & reminder, Display, Premium, About, Account', async () => {
    await renderProfile();
    await screen.findByText('Save changes');
    const order = ['Daily goal & reminder', 'Display', 'Premium', 'About', 'Account'].map((h) => texts().indexOf(h));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Display holds both appearance and the script/form preferences.
    const display = texts().indexOf('Display');
    expect(texts().indexOf('Appearance')).toBeGreaterThan(display);
    expect(texts().indexOf('Appearance')).toBeLessThan(texts().indexOf('Premium'));
  });

  it('no Favorites or Translation requests entries', async () => {
    await renderProfile();
    await screen.findByText('Save changes');
    expect(screen.queryByText('View favorites')).toBeNull();
    expect(screen.queryByText('Vocabulary')).toBeNull();
    expect(screen.queryByText('Translations')).toBeNull();
    expect(screen.queryByText('[translation requests entry]')).toBeNull();
  });

  it('account actions stay: change password, sign out, delete account', async () => {
    await renderProfile();
    await screen.findByText('Save changes');
    for (const label of ['Change password', 'Sign out', 'Delete account']) expect(screen.getByText(label)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Delete account'));
    expect(mockPush).toHaveBeenCalledWith('/account/delete');
  });

  it('no admin entry for a learner', async () => {
    await renderProfile();
    await screen.findByText('Save changes');
    expect(screen.queryByText('Admin dashboard')).toBeNull();
  });

  it('for an admin, the admin entry is at the top and opens the dashboard', async () => {
    mockIsAdmin = true;
    await renderProfile();
    await screen.findByText('Save changes');
    expect(texts().indexOf('Admin dashboard')).toBeLessThan(texts().indexOf('Daily goal & reminder'));
    await fireEvent.press(screen.getByText('Admin dashboard'));
    expect(mockPush).toHaveBeenCalledWith('/admin');
  });
});
