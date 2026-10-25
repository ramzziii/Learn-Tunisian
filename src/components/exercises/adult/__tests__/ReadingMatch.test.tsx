// "Tap the word you hear": the answer shows the result pop-up, and the
// exercise only moves on via its Next button (or its countdown).
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, isFallbackVoice: false, isPlaying: false, retry: jest.fn() }),
}));
jest.mock('@/hooks/useAnswerFeedback', () => ({ useAnswerFeedback: () => ({ playCorrect: jest.fn(), playIncorrect: jest.fn() }) }));
jest.mock('@/components/exercises/shared/VariantCallout', () => ({ VariantCallout: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ReadingMatch } = require('@/components/exercises/adult/ReadingMatch');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const v = (id: string, arabic: string) => ({ id: `${id}-v`, variantLabel: 'primary', wordArabic: arabic, transliteration: id });
const g = (id: string, arabic: string) => ({ id, englishMeaning: `${id} meaning`, variants: [v(id, arabic)] });
const target = g('salam', 'سلام');
const other = g('bonni', 'بني');
const exercise = {
  key: 'k',
  type: 'reading_match',
  targetGroup: target,
  promptVariant: target.variants[0],
  options: [
    { group: target, variant: target.variants[0] },
    { group: other, variant: other.variants[0] },
  ],
} as unknown as ExerciseItem;

async function renderExercise(onComplete: jest.Mock) {
  await render(
    <ThemeProvider>
      <ReadingMatch exercise={exercise} onComplete={onComplete} />
    </ThemeProvider>
  );
}

it('right answer → "Great job" pop-up; Next moves on as correct', async () => {
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await fireEvent.press(screen.getByText('سلام'));

  expect(await screen.findByText('Great job!')).toBeOnTheScreen();
  expect(onComplete).not.toHaveBeenCalled(); // waits for Next / the countdown
  await fireEvent.press(screen.getByText('Next'));
  expect(onComplete).toHaveBeenCalledWith(true);
});

it('wrong answer → "Not quite" pop-up with the right answer; Next moves on as incorrect', async () => {
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await fireEvent.press(screen.getByText('بني'));

  expect(await screen.findByText('Not quite')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Next'));
  expect(onComplete).toHaveBeenCalledWith(false);
});

it('answers are locked once one is chosen', async () => {
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await fireEvent.press(screen.getByText('بني'));
  await fireEvent.press(screen.getAllByText('سلام')[0]);
  await fireEvent.press(await screen.findByText('Next'));

  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(false);
});
