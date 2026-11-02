// Guests (signed out, device only) can't reach account-only places, even by
// a direct link: Profile / Settings, translation requests, account deletion,
// the legacy profile chooser and Today's Practice show the create-account
// explanation instead (with Create account / Sign in), and load nothing.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'guest';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: mockTier, isResolved: true }) }));
jest.mock('@/lib/notifications/reminders', () => ({ scheduleDailyReminder: jest.fn(), cancelDailyReminder: jest.fn(), requestReminderPermission: jest.fn() }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() }), useAudioPlayerStatus: () => ({ playing: false }), setAudioModeAsync: jest.fn() }));
const mockSupabase = { from: jest.fn(), rpc: jest.fn(), functions: { invoke: jest.fn() } };
jest.mock('@/lib/supabase/client', () => ({ supabase: mockSupabase }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

const GUARDED: [string, string][] = [
  ['Profile tab', '../../../app/(tabs)/profile'],
  ['translation requests', '../../../app/translation-requests'],
  ['account deletion', '../../../app/account/delete'],
  ['profile chooser', '../../../app/profiles/index'],
  ["Today's Practice", '../../../app/todays-practice'],
];

beforeEach(() => {
  mockPush.mockReset();
  mockTier = 'guest';
  mockSupabase.from.mockReset();
  mockSupabase.rpc.mockReset();
  mockSupabase.functions.invoke.mockReset();
});

describe.each(GUARDED)('%s, as a guest', (_label, path) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Screen = require(path).default;

  it('shows the create-account explanation and loads nothing', async () => {
    await themed(<Screen />);
    expect(screen.getAllByText(/create a free account/i)[0]).toBeOnTheScreen();
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('offers Create account (age gate first) and Sign in', async () => {
    await themed(<Screen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create a free account' }));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/age');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
});

describe('the create-account screen used by nudges and locks', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const CreateAccount = require('../../../app/guest/create-account').default;

  it('friendly, no urgency: "Create a free account to keep learning", Create account and Not now', async () => {
    await themed(<CreateAccount />);
    expect(screen.getByText('Create a free account to keep learning')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a free account' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeOnTheScreen();
    const text = screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join('')).join(' ');
    expect(text).not.toMatch(/hurry|last chance|only \d+ left|expires|limited time|don.t miss/i);
  });
});
