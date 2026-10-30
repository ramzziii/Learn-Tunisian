// Listening questions inside the shared session engine: standalone Listening
// practice runs listening-only on the same daily-goal timer and completion
// screen; each answer feeds spaced repetition exactly once.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { makeGroup } from '@/test-utils/wordGroupFixtures';
import type { ExerciseItem } from '@/types/exercises';

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
// The real queue; the exercise UI is a stub that reports what it was given.
jest.mock('@/components/exercises/shared/ExerciseRenderer', () => ({
  ExerciseRenderer: ({ exercise, onComplete }: { exercise: ExerciseItem; onComplete: (c: boolean) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Type: ${exercise.type}`}</Text>
        <Pressable onPress={() => onComplete(false)}>
          <Text>Answer wrong</Text>
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

const groups = ['a', 'b', 'c', 'd'].map((id) => makeGroup(id, { listenable: true }));

const renderRunner = () =>
  render(
    <ThemeProvider>
      <SessionRunner groups={groups} goalMinutes={5} profileId="p1" sessionType="review" emptyMessage="Nothing here." exerciseMode="listening" />
    </ThemeProvider>
  );

beforeEach(() => mockRecordResult.mockClear());

it('listening mode serves only listening questions', async () => {
  await renderRunner();
  expect(screen.getByText(/Type: listen_(recording|meaning)/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Answer wrong'));
  expect(screen.getByText(/Type: listen_(recording|meaning)/)).toBeOnTheScreen();
});

it('each answer is recorded once, as the existing right/wrong result', async () => {
  await renderRunner();
  await fireEvent.press(screen.getByText('Answer wrong'));
  expect(mockRecordResult).toHaveBeenCalledTimes(1);
  expect(mockRecordResult).toHaveBeenCalledWith('p1', expect.any(String), false);
});

it('ends on the standard completion screen when the daily-goal timer is reached', async () => {
  await renderRunner();
  await act(async () => mockCompleteTimer());
  expect(screen.getByText('Session summary')).toBeOnTheScreen();
});
