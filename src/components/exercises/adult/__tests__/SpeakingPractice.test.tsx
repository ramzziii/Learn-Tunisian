// "Listen, then record yourself saying it": when a pronunciation isn't
// recognized, the learner decides — try again or keep going. After 4 misses
// the app says it'll come back to the word and moves on by itself; a word
// left mispronounced is reported so the session can revisit it at the end.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

const mockTranscribe = jest.fn();
const mockRecorder = {
  uri: 'file:///recordings/take.m4a' as string | null,
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setAudioModeAsync: jest.fn(async () => undefined),
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 1500 }),
  useAudioPlayer: () => ({ replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));
// Live scoring on (the default .env is mock mode, where nothing is scored).
jest.mock('@/lib/ai', () => ({ isUsingMockAiProvider: false }));
jest.mock('@/lib/ai/functionsClient', () => ({ transcribeAudio: (...args: unknown[]) => mockTranscribe(...args) }));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, retry: jest.fn() }),
}));
jest.mock('@/hooks/useAnswerFeedback', () => ({ useAnswerFeedback: () => ({ playCorrect: jest.fn(), playIncorrect: jest.fn() }) }));
jest.mock('@/components/exercises/shared/VariantCallout', () => ({ VariantCallout: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SpeakingPractice } = require('@/components/exercises/adult/SpeakingPractice');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const exercise = {
  key: 'wg1-0-0',
  type: 'speaking',
  targetGroup: {
    id: 'wg1',
    englishMeaning: 'hello',
    variants: [{ id: 'v1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema' }],
  },
  promptVariant: { id: 'v1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema' },
  options: [],
} as unknown as ExerciseItem;

async function recordAndCheck() {
  await fireEvent.press(await screen.findByLabelText('Start recording'));
  await fireEvent.press(await screen.findByLabelText('Stop recording'));
  await fireEvent.press(await screen.findByText('Check pronunciation'));
}

async function renderExercise(onComplete: jest.Mock, item: ExerciseItem = exercise) {
  await render(
    <ThemeProvider>
      <SpeakingPractice exercise={item} onComplete={onComplete} />
    </ThemeProvider>
  );
}

beforeEach(() => mockTranscribe.mockReset());

it('not recognized: offers both "Try again" and "Keep going" — the learner decides', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'something else entirely' });
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await recordAndCheck();

  expect(await screen.findByText(/Not quite/)).toBeOnTheScreen();
  expect(screen.getByText('Try again')).toBeOnTheScreen();
  expect(screen.getByText('Keep going')).toBeOnTheScreen();
  expect(onComplete).not.toHaveBeenCalled(); // never moves on by itself
});

it('"Keep going" moves on without costing mastery, flagged to revisit at the end', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'nope' });
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await recordAndCheck();
  await fireEvent.press(await screen.findByText('Keep going'));

  expect(onComplete).toHaveBeenCalledWith(true, { mispronounced: true });
});

async function missTimes(n: number) {
  for (let i = 0; i < n; i++) {
    await recordAndCheck();
    if (i < n - 1) await fireEvent.press(await screen.findByText('Try again'));
  }
}

it('shows how many tries are used before it moves on', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'nope' });
  await renderExercise(jest.fn());

  await missTimes(2);

  expect(await screen.findByText('Try 2 of 4')).toBeOnTheScreen();
});

it('4th miss: says it will come back to the word, then moves on by itself', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'nope' });
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await missTimes(4);

  expect(await screen.findByText(/we’ll come back to it at the end/)).toBeOnTheScreen();
  expect(screen.queryByText('Try again')).toBeNull();
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith(true, { mispronounced: true }), { timeout: 4000 });
  expect(onComplete).toHaveBeenCalledTimes(1);
}, 10000);

it('4th miss: "Next word" skips the wait, and the word is only reported once', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'nope' });
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await missTimes(4);
  await fireEvent.press(await screen.findByText('Next word'));
  await new Promise((r) => setTimeout(r, 2800)); // past the auto-advance

  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(true, { mispronounced: true });
}, 10000);

it('during the end-of-session revisit, the 4th miss does not promise another revisit', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'nope' });
  await renderExercise(jest.fn(), { ...exercise, isRevisit: true } as ExerciseItem);

  await missTimes(4);

  expect(await screen.findByText(/it’ll come up again in your reviews/)).toBeOnTheScreen();
}, 10000);

it('recognized: confirms and continues', async () => {
  mockTranscribe.mockResolvedValue({ ok: true, text: 'عسلامة' }); // speech-to-text returns Arabic script
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await recordAndCheck();
  await waitFor(() => expect(screen.getByText(/Nice! That sounds right/)).toBeOnTheScreen());
  await fireEvent.press(screen.getByText('Continue'));

  expect(onComplete).toHaveBeenCalledWith(true);
});
