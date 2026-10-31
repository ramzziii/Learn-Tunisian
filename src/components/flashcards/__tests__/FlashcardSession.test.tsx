// A flashcard quiz: each card asks a question with answer choices (Tunisian →
// meaning, or meaning → Tunisian). The word's recording plays by itself (after
// answering, for meaning → Tunisian). The app checks the answer, shows the
// standard result sheet — "Great job!" or "Not quite" with the right answer,
// and Next — and records one result through the existing progress write. A batch ends at a natural stopping point with the
// standard completion card — Another batch, Add more time (timer only, never
// the saved goal) or Back to home, which logs the minutes toward the goal.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { WordGroupWithVariants } from '@/types/models';

const mockRecord = jest.fn();
const mockLog = jest.fn(async () => undefined);
const mockReplace = jest.fn();
const mockAddMinutes = jest.fn();
const mockUpdateGoal = jest.fn();
const mockPlay = jest.fn();
const mockPlayCorrect = jest.fn();
const mockPlayIncorrect = jest.fn();
// Every useWordAudioPlayer call: which form, and whether it plays by itself.
let mockPlayers: { id: string | undefined; autoPlay: boolean }[] = [];
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
jest.mock('@/hooks/useAnswerFeedback', () => ({
  useAnswerFeedback: () => ({ playCorrect: mockPlayCorrect, playIncorrect: mockPlayIncorrect }),
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: (variant: { id: string } | null, options?: { autoPlay?: boolean }) => {
    mockPlayers.push({ id: variant?.id, autoPlay: !!options?.autoPlay });
    return {
      play: mockPlay,
      isPlaying: false,
      isResolving: mockAudio.isResolving,
      hasAudio: !mockAudio.hasError,
      isFallbackVoice: false,
      hasError: mockAudio.hasError,
      retry: jest.fn(),
    };
  },
}));
const autoPlayed = (variantId: string) => mockPlayers.some((p) => p.id === variantId && p.autoPlay);
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
// Other words the learner has met — where wrong answers come from.
const POOL = ['p1', 'p2', 'p3', 'p4'].map((id) => makeGroup(id));

const renderSession = (
  cards: WordGroupWithVariants[],
  direction: 'tunisian-first' | 'meaning-first' = 'tunisian-first',
  pool: WordGroupWithVariants[] = POOL
) =>
  render(
    <ThemeProvider>
      <FlashcardSession cards={cards} distractorPool={pool} profileId="p1" goalMinutes={5} initialDirection={direction} />
    </ThemeProvider>
  );

const choices = () => screen.getAllByRole('button', { name: /^Answer: / });
const choose = (label: string | RegExp) => fireEvent.press(screen.getByRole('button', { name: label }));
const chooseWrong = (rightLabel: string) =>
  fireEvent.press(choices().find((c) => c.props.accessibilityLabel !== rightLabel)!);
const next = () => fireEvent.press(screen.getByText('Next'));
async function answerCards(from: number, n: number) {
  for (let i = from; i < from + n; i++) {
    await choose(`Answer: meaning w${i}`);
    await next();
  }
}

beforeEach(() => {
  [mockRecord, mockLog, mockReplace, mockAddMinutes, mockUpdateGoal, mockPlay, mockPlayCorrect, mockPlayIncorrect].forEach((m) =>
    m.mockReset()
  );
  mockPlayers = [];
  mockRecord.mockResolvedValue({ correctCount: 1, status: 'learning' });
  mockLog.mockResolvedValue(undefined);
  mockAudio = { hasError: false, isResolving: false };
});

describe('questions', () => {
  it('Tunisian → meaning: the word with its speaker, and meanings to choose from — no Show answer', async () => {
    await renderSession([withAudio('a')]);
    expect(screen.getByText('What does this mean?')).toBeOnTheScreen();
    expect(screen.getByText('عربي-a')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeOnTheScreen();
    expect(choices()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Answer: meaning a' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
    for (const old of ['Missed it', 'Almost', 'Got it']) expect(screen.queryByRole('button', { name: old })).toBeNull();
  });

  it('meaning → Tunisian: the meaning, and Tunisian words to choose from', async () => {
    await renderSession([withAudio('a')], 'meaning-first');
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
    expect(screen.getByText('Which is the Tunisian?')).toBeOnTheScreen();
    expect(choices()).toHaveLength(4);
    expect(screen.getByRole('button', { name: /^Answer: عربي-a/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play recording' })).toBeNull(); // would give it away
  });

  it('switching direction asks the same card the other way, without answering it', async () => {
    await renderSession([withAudio('a')]);
    await fireEvent.press(screen.getByRole('button', { name: /Showing Tunisian first/ }));
    expect(screen.getByText('Which is the Tunisian?')).toBeOnTheScreen();
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe('the word plays by itself', () => {
  it('Tunisian → meaning: each card’s recording plays as soon as it appears — no tap needed', async () => {
    await renderSession(deckOf(3));
    expect(autoPlayed('w0-primary')).toBe(true);
    expect(mockRecord).not.toHaveBeenCalled(); // playing is never an answer
    await choose('Answer: meaning w0');
    await next();
    expect(autoPlayed('w1-primary')).toBe(true);
  });

  it('meaning → Tunisian: it plays only after answering (before would give it away)', async () => {
    await renderSession([withAudio('a')], 'meaning-first');
    expect(autoPlayed('a-primary')).toBe(false);
    await choose(/^Answer: عربي-a/);
    expect(autoPlayed('a-primary')).toBe(true);
  });

  it('no recording: nothing plays (never another form or a device voice), and the card still works', async () => {
    await renderSession([makeGroup('a')]);
    expect(autoPlayed('a-primary')).toBe(false);
    await choose('Answer: meaning a');
    expect(mockRecord).toHaveBeenCalledWith('p1', 'a', true);
  });
});

describe('answers', () => {
  it('a right answer: the "Great job!" sheet, one correct result recorded, then Next', async () => {
    await renderSession(deckOf(3));
    await choose('Answer: meaning w0');
    expect(screen.getByText('Great job!')).toBeOnTheScreen();
    expect(mockPlayCorrect).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith('p1', 'w0', true);
    await next();
    expect(screen.getByText('عربي-w1')).toBeOnTheScreen();
  });

  it('a wrong answer: the "Not quite" sheet with the right answer, one incorrect result', async () => {
    await renderSession(deckOf(3));
    await chooseWrong('Answer: meaning w0');
    expect(screen.getByText('Not quite')).toBeOnTheScreen();
    expect(screen.getByText('Here’s the right answer:')).toBeOnTheScreen();
    // In the sheet: the word, its transliteration and its meaning.
    expect(screen.getAllByText('عربي-w0').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('meaning w0').length).toBeGreaterThanOrEqual(2);
    expect(mockPlayIncorrect).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith('p1', 'w0', false);
  });

  it('a wrong answer highlights the right choice and marks the one picked', async () => {
    await renderSession(deckOf(3));
    const wrong = choices().find((c) => c.props.accessibilityLabel !== 'Answer: meaning w0')!;
    await fireEvent.press(wrong);

    const right = screen.getByRole('button', { name: 'Answer: meaning w0' });
    expect(within(right).getByText('✓ Correct answer')).toBeOnTheScreen();
    expect(right.props.accessibilityValue).toEqual(expect.objectContaining({ text: 'Correct answer' }));
    const picked = screen.getByRole('button', { name: wrong.props.accessibilityLabel });
    expect(within(picked).getByText('✗ Your answer')).toBeOnTheScreen();
    expect(picked.props.accessibilityValue).toEqual(expect.objectContaining({ text: 'Your answer, not correct' }));
    // Only those two are marked.
    expect(screen.getAllByText(/✓ Correct answer|✗ Your answer/)).toHaveLength(2);
  });

  it('a right answer marks just that choice', async () => {
    await renderSession(deckOf(3));
    await choose('Answer: meaning w0');
    const right = screen.getByRole('button', { name: 'Answer: meaning w0' });
    expect(within(right).getByText('✓ Correct answer')).toBeOnTheScreen();
    expect(screen.queryByText('✗ Your answer')).toBeNull();
  });

  it('nothing is marked before answering', async () => {
    await renderSession(deckOf(3));
    expect(screen.queryByText(/✓ Correct answer|✗ Your answer/)).toBeNull();
  });

  it('meaning → Tunisian: a wrong answer shows the right Tunisian word, and plays it', async () => {
    await renderSession([withAudio('a')], 'meaning-first');
    await fireEvent.press(choices().find((c) => !/عربي-a/.test(c.props.accessibilityLabel))!);
    expect(screen.getByText('Not quite')).toBeOnTheScreen();
    expect(screen.getAllByText('عربي-a').length).toBeGreaterThanOrEqual(2);
    expect(autoPlayed('a-primary')).toBe(true);
    expect(mockRecord).toHaveBeenCalledWith('p1', 'a', false);
  });

  it('any form of the right word is accepted', async () => {
    const twoForms = makeGroup('t', {
      variants: [
        makeVariant('t', { id: 't-m', variantLabel: 'masculine', wordArabic: 'مذكر', transliteration: 'm' }),
        makeVariant('t', { id: 't-f', variantLabel: 'feminine', wordArabic: 'مؤنث', transliteration: 'f' }),
      ],
    });
    await renderSession([twoForms], 'meaning-first');
    await choose(/^Answer: (مذكر|مؤنث)/);
    expect(screen.getByText('Great job!')).toBeOnTheScreen();
    expect(mockRecord).toHaveBeenCalledWith('p1', 't', true);
  });

  it('one result per card: a second tap, playing audio or Next twice records nothing more', async () => {
    await renderSession(deckOf(3));
    await fireEvent.press(screen.getByRole('button', { name: 'Play recording' }));
    expect(mockRecord).not.toHaveBeenCalled();
    expect(screen.queryByText('Great job!')).toBeNull();

    const right = screen.getByRole('button', { name: 'Answer: meaning w0' });
    await fireEvent.press(right);
    await fireEvent.press(right);
    await chooseWrong('Answer: meaning w0'); // choices are locked after answering
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith('p1', 'w0', true);

    const nextButton = screen.getByText('Next');
    await fireEvent.press(nextButton);
    await fireEvent.press(nextButton);
    expect(screen.getByText('عربي-w1')).toBeOnTheScreen();
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('a result that can’t be saved says so, and the session carries on', async () => {
    mockRecord.mockRejectedValueOnce(new Error('Network request failed'));
    await renderSession(deckOf(3));
    await choose('Answer: meaning w0');
    expect(await screen.findByText(/not saved — check your connection/i)).toBeOnTheScreen();
    await next();
    expect(screen.getByText('عربي-w1')).toBeOnTheScreen();
  });
});

describe('not enough words for a fair question', () => {
  it('with too few other words, says so instead of quizzing', async () => {
    await renderSession([withAudio('a'), withAudio('b')], 'tunisian-first', []);
    expect(screen.getByText('Not enough words for a quiz yet')).toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: /^Answer: / })).toHaveLength(0);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('a card whose other words are all look-alikes is skipped; the rest of the deck is quizzed', async () => {
    // x means the same as q1/q2 and is written like b: none of them is a fair
    // wrong answer for x, leaving only "a" — not enough, so x is skipped.
    const x = makeGroup('x', { englishMeaning: 'same', variants: [makeVariant('x', { wordArabic: 'عربي-b' })] });
    const pool = [makeGroup('q1', { englishMeaning: 'same' }), makeGroup('q2', { englishMeaning: 'same' }), makeGroup('b')];
    await renderSession([x, withAudio('a')], 'tunisian-first', pool);
    expect(screen.getByText('عربي-a')).toBeOnTheScreen();
    await choose('Answer: meaning a');
    await next();
    expect(screen.getByText('Review complete!')).toBeOnTheScreen();
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});

describe('cards and audio', () => {
  it('no recording: says so, with no broken play button', async () => {
    await renderSession([makeGroup('a')]);
    expect(screen.getByText('No recording for this form yet')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play recording' })).toBeNull();
  });

  it('a recording that can’t load (offline, not cached) offers a retry instead of a dead button', async () => {
    mockAudio = { hasError: true, isResolving: false };
    await renderSession([withAudio('a')]);
    expect(screen.getByRole('button', { name: 'Retry recording' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Play recording' })).toBeNull();
  });
});

describe('batches and the daily goal', () => {
  it('stops after a batch of 15 with the standard completion card and Another batch', async () => {
    await renderSession(deckOf(20));
    await answerCards(0, 15);
    expect(screen.getByText('Review complete!')).toBeOnTheScreen();
    expect(mockRecord).toHaveBeenCalledTimes(15);

    await fireEvent.press(screen.getByRole('button', { name: 'Another batch' }));
    expect(screen.queryByText('Review complete!')).toBeNull();
    expect(screen.getByText('عربي-w15')).toBeOnTheScreen();
  });

  it('when every card has been shown, there’s no Another batch or Add more time', async () => {
    await renderSession(deckOf(3));
    await answerCards(0, 3);
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
    await renderSession(deckOf(3));
    await answerCards(0, 3);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to home' }));
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith('p1', 'review', 240);
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('leaving early still logs the time spent', async () => {
    await renderSession(deckOf(3));
    await fireEvent.press(screen.getByRole('button', { name: 'Exit flashcards' }));
    expect(mockLog).toHaveBeenCalledWith('p1', 'review', 240);
    expect(mockReplace).toHaveBeenCalledWith('/flashcards');
  });
});
