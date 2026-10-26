// Learner "Request a Translation" screen: the 3-business-day promise, the
// free/Premium allowance (from the server), sending, the request history
// (submitted/answered only), cancelling, and listening to the answer.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSubmit = jest.fn();
const mockFetchMine = jest.fn();
const mockAllowance = jest.fn();
const mockCancel = jest.fn();
const mockMarkSeen = jest.fn();
const mockAudioUrl = jest.fn();
const mockPush = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };

class MockLimitError extends Error {}

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/data/translationRequests', () => ({
  submitTranslationRequest: (...a: unknown[]) => mockSubmit(...a),
  fetchMyTranslationRequests: (...a: unknown[]) => mockFetchMine(...a),
  fetchTranslationAllowance: (...a: unknown[]) => mockAllowance(...a),
  cancelTranslationRequest: (...a: unknown[]) => mockCancel(...a),
  markTranslationAnswersSeen: (...a: unknown[]) => mockMarkSeen(...a),
  getTranslationAnswerAudioUrl: (...a: unknown[]) => mockAudioUrl(...a),
  TranslationRequestLimitError: MockLimitError,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TranslationRequestsScreen = require('../../../app/translation-requests').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <TranslationRequestsScreen />
    </ThemeProvider>
  );

const submitted = {
  id: 'r1',
  englishText: 'Thank you very much',
  status: 'submitted',
  submittedAt: '2026-10-26T09:00:00Z',
  dueAt: '2026-10-29T23:00:00Z',
  answeredAt: null,
  answer: null,
  isNewAnswer: false,
};
const answered = {
  id: 'r2',
  englishText: 'Where is the market?',
  status: 'answered',
  submittedAt: '2026-10-20T09:00:00Z',
  dueAt: '2026-10-23T23:00:00Z',
  answeredAt: '2026-10-21T10:00:00Z',
  answer: {
    arabic: 'وين السوق؟',
    transliteration: 'win es-souk?',
    english: 'Where’s the market?',
    audioPath: 'r2/answer-1.m4a',
    explanationAudioPath: null as string | null,
  },
  isNewAnswer: true,
};

const NOW = Date.parse('2026-10-30T14:00:00Z'); // a Friday afternoon
let dateNowSpy: jest.SpyInstance;

beforeEach(() => {
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockSubmit.mockReset().mockResolvedValue('r-new');
  mockFetchMine.mockReset().mockResolvedValue([]);
  mockAllowance.mockReset().mockResolvedValue({ isPremium: false, used: 0, remaining: 1 });
  mockCancel.mockReset().mockResolvedValue(undefined);
  mockMarkSeen.mockReset().mockResolvedValue(undefined);
  mockAudioUrl.mockReset().mockResolvedValue('https://signed/r2');
  mockPush.mockReset();
  mockPlayer.replace.mockClear();
  mockPlayer.play.mockClear();
});
afterEach(() => dateNowSpy.mockRestore());

it('explains the 3-business-day promise and what it means today, before anything is sent', async () => {
  await renderScreen();

  expect(await screen.findByText('Request a Translation')).toBeOnTheScreen();
  expect(screen.getByText('We will respond within 3 business days.')).toBeOnTheScreen();
  // Sent on a Friday → Mon, Tue, Wed.
  expect(screen.getByText(/Monday to Friday.*end of Wed, Nov 4/)).toBeOnTheScreen();
});

describe('allowance', () => {
  it('free with the request unused: says one request in total', async () => {
    await renderScreen();
    expect(await screen.findByText(/Free plan: 1 request in total/)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText(/English phrase or sentence/)).toBeOnTheScreen();
  });

  it('free and already used: no form, points to Premium', async () => {
    mockAllowance.mockResolvedValue({ isPremium: false, used: 1, remaining: 0 });
    await renderScreen();

    expect(await screen.findByText(/used your free request/)).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText(/English phrase or sentence/)).toBeNull();
    await fireEvent.press(screen.getByText('See Premium plans'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/plans');
  });

  it('Premium: unlimited', async () => {
    mockAllowance.mockResolvedValue({ isPremium: true, used: 4, remaining: null });
    await renderScreen();
    expect(await screen.findByText(/Premium: unlimited requests/)).toBeOnTheScreen();
  });
});

describe('sending a request', () => {
  it('sends the text with a client key, clears the box, confirms, and lists it', async () => {
    mockFetchMine.mockResolvedValueOnce([]).mockResolvedValue([submitted]);
    await renderScreen();

    await fireEvent.changeText(await screen.findByPlaceholderText(/English phrase or sentence/), 'Thank you very much');
    await fireEvent.press(screen.getByText('Send request'));

    expect(mockSubmit).toHaveBeenCalledWith('Thank you very much', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(await screen.findByText(/Request sent/)).toBeOnTheScreen();
    expect(screen.getByText('Thank you very much')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText(/English phrase or sentence/).props.value).toBe('');
  });

  it('while sending, the button shows progress (no second tap target)', async () => {
    let labelDuringRequest: unknown = 'not checked';
    mockSubmit.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 0));
      labelDuringRequest = screen.queryByText('Send request');
      return 'r-new';
    });
    await renderScreen();

    await fireEvent.changeText(await screen.findByPlaceholderText(/English phrase or sentence/), 'Hello');
    await fireEvent.press(screen.getByText('Send request'));

    expect(labelDuringRequest).toBeNull();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('a retry after a failed send reuses the same client key, so the server can’t create a duplicate', async () => {
    mockSubmit.mockRejectedValueOnce(new Error('Couldn’t send your request (Failed to fetch).')).mockResolvedValueOnce('r-new');
    await renderScreen();

    await fireEvent.changeText(await screen.findByPlaceholderText(/English phrase or sentence/), 'Hello');
    await fireEvent.press(screen.getByText('Send request'));
    expect(await screen.findByText(/Failed to fetch/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Send request'));

    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(mockSubmit.mock.calls[1][1]).toBe(mockSubmit.mock.calls[0][1]);
    expect(await screen.findByText(/Request sent/)).toBeOnTheScreen();
  });

  it('the server’s free-limit refusal is shown (even if the app thought one was left)', async () => {
    mockSubmit.mockRejectedValue(new MockLimitError('You’ve used your free request. Premium includes unlimited requests.'));
    await renderScreen();

    await fireEvent.changeText(await screen.findByPlaceholderText(/English phrase or sentence/), 'Hello');
    await fireEvent.press(screen.getByText('Send request'));

    expect(await screen.findByText(/used your free request/)).toBeOnTheScreen();
    expect(screen.queryByText(/Request sent/)).toBeNull();
  });

  it('empty or too-long text shows the reason and sends nothing', async () => {
    await renderScreen();

    await fireEvent.changeText(await screen.findByPlaceholderText(/English phrase or sentence/), 'a'.repeat(501));
    await fireEvent.press(screen.getByText('Send request'));

    expect(await screen.findByText(/500 characters/)).toBeOnTheScreen();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

describe('history', () => {
  it('empty: says so', async () => {
    await renderScreen();
    expect(await screen.findByText(/No requests yet/)).toBeOnTheScreen();
  });

  it('a submitted request shows when to expect the answer; an answered one shows the answer', async () => {
    mockFetchMine.mockResolvedValue([answered, submitted]);
    await renderScreen();

    expect(await screen.findByText('Thank you very much')).toBeOnTheScreen();
    expect(screen.getByText('Submitted')).toBeOnTheScreen();
    expect(screen.getByText(/Answer expected by the end of Thu, Oct 29/)).toBeOnTheScreen();

    expect(screen.getByText('Answered')).toBeOnTheScreen();
    expect(screen.getByText('وين السوق؟')).toBeOnTheScreen();
    expect(screen.getByText('win es-souk?')).toBeOnTheScreen();
    expect(screen.getByText(/Meaning: Where’s the market\?/)).toBeOnTheScreen();
    // The learner's own question and the admin's meaning are labelled apart.
    expect(screen.getAllByText('Your question').length).toBe(2);
  });

  it('a new answer is flagged, then marked seen', async () => {
    mockFetchMine.mockResolvedValue([answered]);
    await renderScreen();

    expect(await screen.findByText('New')).toBeOnTheScreen();
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
  });

  it('nothing new: nothing marked', async () => {
    mockFetchMine.mockResolvedValue([submitted]);
    await renderScreen();
    await screen.findByText('Thank you very much');
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('plays the native recording from a signed URL', async () => {
    mockFetchMine.mockResolvedValue([answered]);
    await renderScreen();

    await fireEvent.press(await screen.findByText('▶ Play native recording'));

    expect(mockAudioUrl).toHaveBeenCalledWith('r2/answer-1.m4a');
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://signed/r2' });
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  it('no explanation recording: no "Play explanation" control', async () => {
    mockFetchMine.mockResolvedValue([answered]);
    await renderScreen();
    await screen.findByText('▶ Play native recording');
    expect(screen.queryByText('▶ Play explanation')).toBeNull();
  });

  it('with an explanation: a separate "Play explanation" plays that file, not the pronunciation', async () => {
    mockFetchMine.mockResolvedValue([{ ...answered, answer: { ...answered.answer, explanationAudioPath: 'r2/explanation-2.m4a' } }]);
    mockAudioUrl.mockImplementation(async (path: string) => `https://signed/${path}`);
    await renderScreen();

    expect(mockPlayer.play).not.toHaveBeenCalled(); // never auto-plays
    await fireEvent.press(await screen.findByText('▶ Play explanation'));

    expect(mockAudioUrl).toHaveBeenCalledWith('r2/explanation-2.m4a');
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://signed/r2/explanation-2.m4a' });
  });

  it('a recording that can’t be loaded says so', async () => {
    mockFetchMine.mockResolvedValue([answered]);
    mockAudioUrl.mockRejectedValue(new Error('Object not found'));
    await renderScreen();

    await fireEvent.press(await screen.findByText('▶ Play native recording'));

    expect(await screen.findByText(/Couldn.t play the recording/)).toBeOnTheScreen();
  });

  it('couldn’t load (offline): explains and offers Retry', async () => {
    mockFetchMine.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue([submitted]);
    await renderScreen();

    expect(await screen.findByText(/Couldn.t load your requests/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Thank you very much')).toBeOnTheScreen();
  });
});

describe('cancelling', () => {
  it('asks first, then cancels and drops it from the list', async () => {
    mockFetchMine.mockResolvedValueOnce([submitted]).mockResolvedValue([]);
    await renderScreen();

    await fireEvent.press(await screen.findByText('Cancel request'));
    expect(screen.getByText('Cancel this request?')).toBeOnTheScreen();
    expect(mockCancel).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Yes, cancel it'));

    expect(mockCancel).toHaveBeenCalledWith('r1');
    expect(await screen.findByText(/No requests yet/)).toBeOnTheScreen();
  });

  it('"Keep it" backs out', async () => {
    mockFetchMine.mockResolvedValue([submitted]);
    await renderScreen();

    await fireEvent.press(await screen.findByText('Cancel request'));
    await fireEvent.press(screen.getByText('Keep it'));

    expect(mockCancel).not.toHaveBeenCalled();
    expect(screen.queryByText('Cancel this request?')).toBeNull();
  });

  it('a failed cancel shows why and keeps the request', async () => {
    mockFetchMine.mockResolvedValue([submitted]);
    mockCancel.mockRejectedValue(new Error('This request has already been answered, so it can’t be cancelled.'));
    await renderScreen();

    await fireEvent.press(await screen.findByText('Cancel request'));
    await fireEvent.press(screen.getByText('Yes, cancel it'));

    expect(await screen.findByText(/already been answered/)).toBeOnTheScreen();
    expect(screen.getByText('Thank you very much')).toBeOnTheScreen();
  });

  it('answered requests can’t be cancelled', async () => {
    mockFetchMine.mockResolvedValue([answered]);
    await renderScreen();
    await screen.findByText('وين السوق؟');
    expect(screen.queryByText('Cancel request')).toBeNull();
  });
});
