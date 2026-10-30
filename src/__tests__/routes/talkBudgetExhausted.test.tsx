// The conversation screen when the server's monthly AI budget is used up:
// a friendly "temporarily unavailable" message and a way back — no crash,
// and no "Try again" that would just repeat a paid call. The daily-limit
// and ordinary error banners are unchanged.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockRetry = jest.fn();
const mockReplace = jest.fn();
let mockError: { kind: string; message: string } | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ scenarioId: 'cafe' }),
}));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ activeProfile: { id: 'p1', name: 'Sam' } }),
}));
jest.mock('@/lib/ai', () => ({ isUsingMockAiProvider: false }));
jest.mock('@/lib/ai/functionsClient', () => ({ transcribeAudio: jest.fn() }));
jest.mock('@/hooks/useConversation', () => ({
  useConversation: () => ({
    status: 'error',
    messages: [],
    vocabulary: [],
    error: mockError,
    sendMessage: jest.fn(),
    retry: (...a: unknown[]) => mockRetry(...a),
  }),
}));
jest.mock('@/hooks/useTutorSpeech', () => ({
  useTutorSpeech: () => ({ speak: jest.fn(), stop: jest.fn(), isSpeaking: false, isResolving: false, hasError: false, errorMessage: null }),
}));
jest.mock('@/hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({ permission: 'ready', isRecording: false, start: jest.fn(), stop: jest.fn(), requestPermission: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TalkConversation = require('../../../app/talk/[scenarioId]').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <TalkConversation />
    </ThemeProvider>
  );

beforeEach(() => {
  mockRetry.mockReset();
  mockReplace.mockReset();
});

it('budget_exhausted: friendly message, a way back, and no "Try again"', async () => {
  mockError = { kind: 'budget_exhausted', message: 'Talk to a Tunisian is temporarily unavailable. Please try again later.' };
  await renderScreen();

  expect(screen.getByText('Talk to a Tunisian is temporarily unavailable. Please try again later.')).toBeOnTheScreen();
  expect(screen.queryByText('Try again')).toBeNull();

  await fireEvent.press(screen.getByText('Back to situations'));
  expect(mockReplace).toHaveBeenCalledWith('/talk');
  expect(mockRetry).not.toHaveBeenCalled();
});

it('the daily limit banner is unchanged', async () => {
  mockError = { kind: 'daily_limit_reached', message: 'x' };
  await renderScreen();

  expect(screen.getByText("You've reached today's conversation limit — come back tomorrow!")).toBeOnTheScreen();
  expect(screen.getByText('Back to situations')).toBeOnTheScreen();
  expect(screen.queryByText('Try again')).toBeNull();
});

it('an ordinary error still offers "Try again"', async () => {
  mockError = { kind: 'timeout', message: 'x' };
  await renderScreen();

  expect(screen.getByText('That took too long. Give it another try.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Try again'));
  expect(mockRetry).toHaveBeenCalledTimes(1);
});

it('a budget check or accounting failure shows the generic message, not a crash', async () => {
  for (const kind of ['budget_check_failed', 'accounting_failed']) {
    mockError = { kind, message: 'x' };
    const { unmount } = await renderScreen();
    expect(screen.getByText("Something went wrong on our end. Let's try again.")).toBeOnTheScreen();
    await unmount();
  }
});
