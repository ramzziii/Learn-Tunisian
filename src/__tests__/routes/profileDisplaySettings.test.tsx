// Profile → Display: script (Arabic / Latin / Both) and default form
// (Masculine / Feminine / Show both), with a live sample. Saved per
// profile; a failed save says so and keeps the previous choice. The form
// setting is framed as a practice/display choice, never as gender.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockFetchDisplay = jest.fn();
const mockSaveDisplay = jest.fn();
jest.mock('@/data/displayPreferences', () => ({
  fetchDisplayPreferences: (...a: unknown[]) => mockFetchDisplay(...a),
  saveDisplayPreferences: (...a: unknown[]) => mockSaveDisplay(...a),
}));
jest.mock('@/lib/offline/audioCache', () => ({ ensureAudioCached: jest.fn(async () => null) }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() }), useAudioPlayerStatus: () => ({ playing: false }) }));

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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisplayPreferencesProvider } = require('@/lib/display/DisplayPreferencesContext');

const renderProfile = () =>
  render(
    <ThemeProvider>
      <DisplayPreferencesProvider>
        <ProfileScreen />
      </DisplayPreferencesProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  mockFetchDisplay.mockReset().mockResolvedValue({ script: 'both', form: 'both' });
  mockSaveDisplay.mockReset().mockResolvedValue(undefined);
});

const selected = (name: string) => screen.getByRole('radio', { name }).props.accessibilityState?.selected;

it('shows both settings with the current choices selected, and the explanation', async () => {
  await renderProfile();
  expect(await screen.findByText('Display')).toBeOnTheScreen();
  expect(selected('Script: Both')).toBe(true);
  expect(selected('Default form: Show both')).toBe(true);
  expect(screen.getByText(/it does not define your gender/)).toBeOnTheScreen();
});

it('changing the script updates the live sample and saves it', async () => {
  await renderProfile();
  await screen.findByText('Display');
  expect(screen.getByText('تعبان')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('radio', { name: 'Script: Latin' }));

  expect(mockSaveDisplay).toHaveBeenCalledWith('p1', { script: 'latin', form: 'both' });
  expect(screen.queryByText('تعبان')).toBeNull();
  expect(screen.getByText('ta3ban')).toBeOnTheScreen();
});

it('changing the default form reorders the sample and saves it', async () => {
  await renderProfile();
  await screen.findByText('Display');
  await fireEvent.press(screen.getByRole('radio', { name: 'Default form: Feminine' }));

  expect(mockSaveDisplay).toHaveBeenCalledWith('p1', { script: 'both', form: 'feminine' });
  expect(selected('Default form: Feminine')).toBe(true);
  expect(screen.getByText('تعبانة')).toBeOnTheScreen();
  expect(screen.queryByText('تعبان')).toBeNull();
});

it('a failed save keeps the previous choice and says so', async () => {
  mockSaveDisplay.mockRejectedValue(new Error('offline'));
  await renderProfile();
  await screen.findByText('Display');
  await fireEvent.press(screen.getByRole('radio', { name: 'Default form: Masculine' }));

  expect(await screen.findByText(/couldn.t save/i)).toBeOnTheScreen();
  expect(selected('Default form: Show both')).toBe(true);
});
