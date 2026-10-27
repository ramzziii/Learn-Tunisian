// Lessons/review are time-based: mispronounced words are revisited once the
// time goal is reached ("no more words to practice"), before the summary.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

// Never settles: the mastery-badge animation it would trigger is out of scope
// here, and its async updates would otherwise leak between tests.
const mockRecordResult = jest.fn(() => new Promise(() => {}));
let mockCompleteTimer: () => void = () => {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/data/progress', () => ({ recordWordGroupResult: (...a: unknown[]) => mockRecordResult(...(a as [])) }));
jest.mock('@/data/content', () => ({ fetchLessonMap: jest.fn(async () => []) }));
jest.mock('@/data/sessionLogs', () => ({ recordSessionLog: jest.fn(async () => undefined) }));
// The cross-fade between exercises is purely visual; at opacity 0 mid-fade
// the exercise reads as hidden to the queries below.
jest.mock('@/hooks/useFadeInOnChange', () => ({
  useFadeInOnChange: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Animated } = require('react-native');
    return new Animated.Value(1);
  },
}));
jest.mock('@/hooks/useSessionTimer', () => ({
  useSessionTimer: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useState } = require('react');
    const [isComplete, setIsComplete] = useState(false);
    mockCompleteTimer = () => setIsComplete(true);
    return { isComplete, elapsedSeconds: isComplete ? 300 : 30, goalSeconds: 300, addMinutes: () => setIsComplete(false) };
  },
}));
// Every exercise is a speaking one, cycling the lesson's words like the real queue.
jest.mock('@/hooks/useExerciseQueue', () => ({
  useExerciseQueue: (groups: { id: string }[]) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useState } = require('react');
    const [i, setI] = useState(0);
    const group = groups[i % groups.length];
    return {
      currentExercise: { key: `${group.id}-${i}`, type: 'speaking', targetGroup: group, promptVariant: {}, options: [] },
      next: () => setI((n: number) => n + 1),
    };
  },
}));
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
jest.mock('@/components/session/SessionCompleteCard', () => ({
  SessionCompleteCard: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>Session summary</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SessionRunner } = require('@/components/session/SessionRunner');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const groups = ['salam', 'shukran'].map((id) => ({ id, englishMeaning: id, variants: [] }));

const renderSession = () =>
  render(
    <ThemeProvider>
      <SessionRunner groups={groups} goalMinutes={5} profileId="p1" sessionType="lesson" emptyMessage="" />
    </ThemeProvider>
  );

beforeEach(() => mockRecordResult.mockClear());

it('when the time goal is reached, revisits the mispronounced words before the summary', async () => {
  await renderSession();

  await fireEvent.press(await screen.findByText('Move on')); // salam missed
  await fireEvent.press(await screen.findByText('Say it right')); // shukran right
  await act(async () => mockCompleteTimer());

  expect(await screen.findByText(/revisit the tricky word/)).toBeOnTheScreen();
  expect(screen.queryByText('Session summary')).toBeNull();
  await fireEvent.press(screen.getByText('Start'));

  expect(await screen.findByText('Word: salam (revisit)')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Say it right'));

  expect(await screen.findByText('Session summary')).toBeOnTheScreen();
  // The revisit attempt is recorded as progress like any other answer.
  expect(mockRecordResult).toHaveBeenCalledTimes(3);
});

it('a word missed early but said right later in the session is not revisited', async () => {
  await renderSession();

  await fireEvent.press(await screen.findByText('Move on')); // salam missed
  await fireEvent.press(await screen.findByText('Say it right')); // shukran
  await fireEvent.press(await screen.findByText('Say it right')); // salam again — right this time
  await act(async () => mockCompleteTimer());

  expect(await screen.findByText('Session summary')).toBeOnTheScreen();
  expect(screen.queryByText(/revisit the tricky/)).toBeNull();
});

it('nothing mispronounced → summary as before', async () => {
  await renderSession();

  await fireEvent.press(await screen.findByText('Say it right'));
  await act(async () => mockCompleteTimer());

  expect(await screen.findByText('Session summary')).toBeOnTheScreen();
});
