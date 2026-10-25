// The lesson "Listen, then record yourself saying it" exercise is the shared
// record → check → compare flow (tested in PronunciationPractice.test.tsx);
// these cover how it's wired into lessons/review/Speaking Practice.
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

const mockPracticeProps = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/components/exercises/shared/VariantCallout', () => ({ VariantCallout: () => null }));
jest.mock('@/components/pronunciation/PronunciationPractice', () => ({
  PRONUNCIATION_MAX_ATTEMPTS: 3,
  PronunciationPractice: (props: { onFinish: (r: { correct: boolean; attempts: number }) => void; children?: unknown }) => {
    mockPracticeProps(props);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        {props.children as never}
        <Pressable onPress={() => props.onFinish({ correct: true, attempts: 1 })}>
          <Text>Finish: right</Text>
        </Pressable>
        <Pressable onPress={() => props.onFinish({ correct: false, attempts: 2 })}>
          <Text>Finish: moved on</Text>
        </Pressable>
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SpeakingPractice } = require('@/components/exercises/adult/SpeakingPractice');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const promptVariant = { id: 'v1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema' };
const exercise = {
  key: 'wg1-0-0',
  type: 'speaking',
  targetGroup: { id: 'wg1', englishMeaning: 'hello', variants: [promptVariant] },
  promptVariant,
  options: [],
} as unknown as ExerciseItem;

async function renderExercise(onComplete: jest.Mock, item: ExerciseItem = exercise) {
  await render(
    <ThemeProvider>
      <SpeakingPractice exercise={item} onComplete={onComplete} />
    </ThemeProvider>
  );
}

beforeEach(() => mockPracticeProps.mockClear());

it('uses the shared flow: the word’s variants for the check, its prompt recording, three tries, device-voice fallback allowed', async () => {
  await renderExercise(jest.fn());

  expect(mockPracticeProps).toHaveBeenCalledWith(
    expect.objectContaining({
      matchGroup: exercise.targetGroup,
      nativeVariant: promptVariant,
      maxAttempts: 3,
      allowFallbackVoice: true,
    })
  );
  expect(screen.getByText('Listen, then record yourself saying it')).toBeOnTheScreen();
});

it('said right → completes as correct', async () => {
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await fireEvent.press(screen.getByText('Finish: right'));

  expect(onComplete).toHaveBeenCalledWith(true);
});

it('moved on / out of tries → still counted as practiced, flagged to revisit at the end', async () => {
  const onComplete = jest.fn();
  await renderExercise(onComplete);

  await fireEvent.press(screen.getByText('Finish: moved on'));

  expect(onComplete).toHaveBeenCalledWith(true, { mispronounced: true });
});

it('in the end-of-session revisit pass, a miss promises review later instead of another revisit', async () => {
  await renderExercise(jest.fn(), { ...exercise, isRevisit: true } as ExerciseItem);

  expect(mockPracticeProps).toHaveBeenCalledWith(
    expect.objectContaining({ outOfTriesMessage: expect.stringMatching(/come up again in your reviews/) })
  );
});
