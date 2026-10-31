// The daily goal is a target, not a limit: when a session's time is up, the
// completion screen offers "Add more time" (+5 / +10 / +15 min). Choosing it
// continues this session only — the saved daily goal is not changed.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

const mockAddMinutes = jest.fn();
const mockUpdateDailyGoal = jest.fn();
let mockCompleteTimer: () => void = () => {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/data/progress', () => ({ recordWordGroupResult: jest.fn(() => new Promise(() => {})) }));
jest.mock('@/data/content', () => ({ fetchLessonMap: jest.fn(async () => []) }));
jest.mock('@/data/sessionLogs', () => ({ recordSessionLog: jest.fn(async () => undefined) }));
jest.mock('@/data/profiles', () => ({ updateDailyGoalSettings: (...a: unknown[]) => mockUpdateDailyGoal(...a) }));
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
    return {
      isComplete,
      elapsedSeconds: isComplete ? 300 : 30,
      goalSeconds: 300,
      addMinutes: (m: number) => {
        mockAddMinutes(m);
        setIsComplete(false);
      },
    };
  },
}));
jest.mock('@/components/exercises/shared/ExerciseRenderer', () => ({
  ExerciseRenderer: ({ exercise }: { exercise: ExerciseItem }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`Exercise: ${exercise.targetGroup.id}`}</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SessionRunner } = require('@/components/session/SessionRunner');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { makeGroup } = require('@/test-utils/wordGroupFixtures');

const groups = ['a', 'b', 'c', 'd'].map((id) => makeGroup(id));

const renderRunner = () =>
  render(
    <ThemeProvider>
      <SessionRunner groups={groups} goalMinutes={5} profileId="p1" sessionType="lesson" emptyMessage="Nothing here." />
    </ThemeProvider>
  );

beforeEach(() => {
  mockAddMinutes.mockReset();
  mockUpdateDailyGoal.mockReset();
});

it('when the goal is reached, the completion screen offers to keep going', async () => {
  await renderRunner();
  await act(async () => mockCompleteTimer());

  expect(screen.getByText('Want to keep going?')).toBeOnTheScreen();
  for (const label of ['+5 min', '+10 min', '+15 min']) expect(screen.getByText(label)).toBeOnTheScreen();
});

it('Add more time continues this session — and the saved daily goal is untouched', async () => {
  await renderRunner();
  await act(async () => mockCompleteTimer());
  await fireEvent.press(screen.getByText('+10 min'));

  expect(mockAddMinutes).toHaveBeenCalledWith(10);
  expect(screen.getByText(/^Exercise: /)).toBeOnTheScreen();
  expect(mockUpdateDailyGoal).not.toHaveBeenCalled();
});
