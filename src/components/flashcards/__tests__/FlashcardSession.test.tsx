// A flashcard session: the front shows the Tunisian word (with its own
// recording, or "No recording for this form yet"); tapping flips to the
// meaning; then Missed it / Almost / Got it records one result through the
// existing progress write. A batch ends at a natural stopping point with the
// standard completion card — Another batch, Add more time (timer only, never
// the saved goal) or Back to home, which logs the minutes toward the goal.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { WordGroupWithVariants } from '@/types/models';

const mockRecord = jest.fn();
const mockLog = jest.fn(async () => undefined);
const mockReplace = jest.fn();
const mockAddMinutes = jest.fn();
const mockUpdateGoal = jest.fn();
const mockPlay = jest.fn();
let mockAudio: { hasError: boolean; isResolving: boolean } = { hasError: false, isResolving: false };
let mockCompleteTimer: () => void = () => {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() } }));
jest.mock('@/data/progress', () => ({ recordWordGroupResult: (...a: unknown[]) => mockRecord(...a) }));
jest.mock('@/data/sessionLogs', () => ({ recordSessionLog: (...a: unknown[]) => mockLog(...(a as [])) }));
jest.mock('@/data/profiles', () => ({ updateDailyGoalSettings: (...a: unknown[]) => mockUpdateGoal(...a) }));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({
    play: mockPlay,
    isPlaying: false,
    isResolving: mockAudio.isResolving,
    hasAudio: !mockAudio.hasError,
    isFallbackVoice: false,
    hasError: mockAudio.hasError,
    retry: jest.fn(),
  }),
}));
jest.mock('@/hooks/useSessionTimer', () => ({
  useSessionTimer: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useState } = require('react');
    const [isComplete, setIsComplete] = useState(false);
    mockCompleteTimer = () => setIsComplete(true);
    return {
      isComplete,
      elapsedSeconds: 240,
      goalSeconds: 300,
      remainingSeconds: 60,
      addMinutes: (m: number) => {
        mockAddMinutes(m);
        setIsComplete(false);
      },
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FlashcardSession } = require('@/components/flashcards/FlashcardSession');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { makeGroup, makeVariant } = require('@/test-utils/wordGroupFixtures');

const withAudio = (id: string) => makeGroup(id, { variants: [makeVariant(id, { audioPath: `${id}/primary.m4a` })] });
const deckOf = (n: number): WordGroupWithVariants[] => Array.from({ length: n }, (_, i) => withAudio(`w${i}`));

const renderSession = (cards: WordGroupWithVariants[], direction: 'tunisian-first' | 'meaning-first' = 'tunisian-first') =>
  render(
    <ThemeProvider>
      <FlashcardSession cards={cards} profileId="p1" goalMinutes={5} initialDirection={direction} />
    </ThemeProvider>
  );

const flip = () => fireEvent.press(screen.getByRole('button', { name: 'Show answer' }));
const rate = (label: string) => fireEvent.press(screen.getByRole('button', { name: label }));
async function rateCards(n: number, label = 'Got it') {
  for (let i = 0; i < n; i++) {
    await flip();
    await rate(label);
  }
}

beforeEach(() => {
  [mockRecord, mockLog, mockReplace, mockAddMinutes, mockUpdateGoal, mockPlay].forEach((m) => m.mockReset());
  mockRecord.mockResolvedValue({ correctCount: 1, status: 'learning' });
  mockLog.mockResolvedValue(undefined);
  mockAudio = { hasError: false, isResolving: false };
});

describe('a card', () => {
  it('front: the Tunisian word with its speaker; the meaning stays hidden until flipped', async () => {
    await renderSession([withAudio('a')]);
    expect(screen.getByText('عربي-a')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeOnTheScreen();
    expect(screen.queryByText('meaning a')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();

    await flip();
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
    for (const label of ['Missed it', 'Almost', 'Got it']) expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
  });

  it('no recording: says so, with no broken play button — and the card still works', async () => {
    await renderSession([makeGroup('a')]);
    expect(screen.getByText('No recording for this form yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play recording' })).toBeNull();
    await flip();
    await rate('Got it');
    expect(mockRecord).toHaveBeenCalledWith('p1', 'a', true);
  });

  it('a recording that can’t load (offline, not cached) offers a retry instead of a dead button', async () => {
    mockAudio = { hasError: true, isResolving: false };
    await renderSession([withAudio('a')]);
    expect(screen.getByRole('button', { name: 'Retry recording' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play recording' })).toBeNull();
  });

  it('meaning first: the front is the meaning, the Tunisian is revealed', async () => {
    await renderSession([withAudio('a')], 'meaning-first');
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
    expect(screen.queryByText('عربي-a')).toBeNull();
    await flip();
    expect(screen.getByText('عربي-a')).toBeOnTheScreen();
  });

  it('the direction can be switched during the deck', async () => {
    await renderSession([withAudio('a')]);
    await fireEvent.press(screen.getByRole('button', { name: /Showing Tunisian first/ }));
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
    expect(screen.queryByText('عربي-a')).toBeNull();
  });
});

describe('ratings', () => {
  it.each([
    ['Missed it', false],
    ['Almost', false],
    ['Got it', true],
  ])('%s is recorded through the existing progress write as %p', async (label, wasCorrect) => {
    await renderSession(deckOf(2));
    await flip();
    await rate(label);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith('p1', 'w0', wasCorrect);
  });

  it('one rating per card shown: flipping, replaying audio and tapping around record nothing extra', async () => {
    await renderSession(deckOf(3));
    await fireEvent.press(screen.getByRole('button', { name: 'Play recording' }));
    await flip();
    await fireEvent.press(screen.getByRole('button', { name: 'Play recording' }));
    expect(mockRecord).not.toHaveBeenCalled();

    const gotIt = screen.getByRole('button', { name: 'Got it' });
    await fireEvent.press(gotIt);
    await fireEvent.press(gotIt); // a double tap on the same card
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith('p1', 'w0', true);
    expect(screen.getByText('عربي-w1')).toBeOnTheScreen();
  });

  it('a rating that can’t be saved says so, and the session carries on', async () => {
    mockRecord.mockRejectedValueOnce(new Error('Network request failed'));
    await renderSession(deckOf(2));
    await flip();
    await rate('Got it');
    expect(await screen.findByText(/not saved — check your connection/i)).toBeOnTheScreen();
    expect(screen.getByText('عربي-w1')).toBeOnTheScreen();
  });
});

describe('batches and the daily goal', () => {
  it('stops after a batch of 15 with the standard completion card and Another batch', async () => {
    await renderSession(deckOf(20));
    await rateCards(15);
    expect(screen.getByText('Review complete!')).toBeOnTheScreen();
    expect(mockRecord).toHaveBeenCalledTimes(15);

    await fireEvent.press(screen.getByRole('button', { name: 'Another batch' }));
    expect(screen.queryByText('Review complete!')).toBeNull();
    expect(screen.getByText('عربي-w15')).toBeOnTheScreen();
  });

  it('when every card has been shown, there’s no Another batch or Add more time', async () => {
    await renderSession(deckOf(3));
    await rateCards(3);
    expect(screen.getByText('Review complete!')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Another batch' })).toBeNull();
    expect(screen.queryByText('Want to keep going?')).toBeNull();
  });

  it('reaching the time goal shows the completion card; Add more time extends this session only', async () => {
    await renderSession(deckOf(5));
    await act(async () => mockCompleteTimer());
    expect(screen.getByText('Want to keep going?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('+10 min'));
    expect(mockAddMinutes).toHaveBeenCalledWith(10);
    expect(mockUpdateGoal).not.toHaveBeenCalled();
    expect(screen.getByText('عربي-w0')).toBeOnTheScreen();
  });

  it('Back to home logs the minutes as a review session (counts toward the daily goal), once', async () => {
    await renderSession(deckOf(2));
    await rateCards(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to home' }));
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith('p1', 'review', 240);
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('leaving early still logs the time spent', async () => {
    await renderSession(deckOf(2));
    await fireEvent.press(screen.getByRole('button', { name: 'Exit flashcards' }));
    expect(mockLog).toHaveBeenCalledWith('p1', 'review', 240);
    expect(mockReplace).toHaveBeenCalledWith('/flashcards');
  });
});
