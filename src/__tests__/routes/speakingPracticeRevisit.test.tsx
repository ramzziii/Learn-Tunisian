// Speaking Practice (5 words): words left mispronounced are revisited once
// there are no more new words, then the summary shows.
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

const mockMarkSpeakingDone = jest.fn();
const mockProfile = { id: 'p1', track: 'adult' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: mockProfile }) }));
jest.mock('@/lib/dailyChallengeProgress', () => ({ markSpeakingCompletedToday: (...a: unknown[]) => mockMarkSpeakingDone(...a) }));
jest.mock('@/data/content', () => ({ fetchLessonMap: jest.fn(async () => []), fetchWordGroupsForLesson: jest.fn(async () => []) }));
jest.mock('@/data/favorites', () => ({ fetchFavoriteWordGroups: jest.fn(async () => []) }));
jest.mock('@/data/progress', () => ({
  fetchWeakestWordGroups: jest.fn(async () =>
    ['salam', 'shukran', 'bislema'].map((id) => ({
      id,
      englishMeaning: id,
      variants: [{ id: `${id}-v`, variantLabel: 'primary', wordArabic: 'كلمة', transliteration: id }],
    }))
  ),
}));
// Stand-in for the real speaking exercise: the learner either says it right
// or moves on without getting it.
jest.mock('@/components/exercises/shared/ExerciseRenderer', () => ({
  ExerciseRenderer: ({ exercise, onComplete }: { exercise: ExerciseItem; onComplete: (c: boolean, o?: object) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Word: ${exercise.targetGroup.id}${exercise.isRevisit ? ' (revisit)' : ''}`}</Text>
        <Pressable onPress={() => onComplete(true)}>
          <Text>Say it right</Text>
        </Pressable>
        <Pressable onPress={() => onComplete(true, { mispronounced: true })}>
          <Text>Move on</Text>
        </Pressable>
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SpeakingPracticeScreen = require('../../../app/speaking-practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <SpeakingPracticeScreen />
    </ThemeProvider>
  );

beforeEach(() => mockMarkSpeakingDone.mockReset());

it('after the last word, revisits only the words that were mispronounced, then shows the summary', async () => {
  await renderScreen();

  expect(await screen.findByText('Word: salam')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Move on')); // salam missed
  await fireEvent.press(await screen.findByText('Say it right')); // shukran right
  expect(await screen.findByText('Word: bislema')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Move on')); // bislema missed

  // No more new words → revisit screen, not the summary.
  expect(await screen.findByText(/revisit the tricky words/)).toBeOnTheScreen();
  expect(mockMarkSpeakingDone).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Start'));

  expect(await screen.findByText('Word: salam (revisit)')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Say it right')); // got it on the second chance
  expect(await screen.findByText('Word: bislema (revisit)')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Move on')); // missed again — no third round

  expect(await screen.findByText('Nice speaking!')).toBeOnTheScreen();
  expect(screen.getByText('2 of 3 sounded right.')).toBeOnTheScreen();
  expect(mockMarkSpeakingDone).toHaveBeenCalledWith('p1');
});

it('no mispronounced words → straight to the summary, no revisit step', async () => {
  await renderScreen();

  for (let i = 0; i < 3; i++) await fireEvent.press(await screen.findByText('Say it right'));

  expect(await screen.findByText('Nice speaking!')).toBeOnTheScreen();
  expect(screen.queryByText(/revisit the tricky/)).toBeNull();
});

it('"Skip for now" on the revisit screen goes to the summary', async () => {
  await renderScreen();

  await fireEvent.press(await screen.findByText('Move on'));
  await fireEvent.press(await screen.findByText('Say it right'));
  await fireEvent.press(await screen.findByText('Say it right'));
  await fireEvent.press(await screen.findByText('Skip for now'));

  expect(await screen.findByText('2 of 3 sounded right.')).toBeOnTheScreen();
});
