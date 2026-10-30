// Practice → Listening practice: gathers the learner's words (weakest first,
// then favorites, then the current lesson), and either runs a listening-only
// session on the shared engine — daily goal, completion screen — or, without
// enough native recordings, shows an honest empty state instead of a broken
// session.
import { render, screen } from '@testing-library/react-native';

import { makeGroup } from '@/test-utils/wordGroupFixtures';

const mockWeakest = jest.fn();
const mockFavorites = jest.fn();
const mockLessonMap = jest.fn();
const mockLessonGroups = jest.fn();
const mockRunnerProps: Record<string, unknown>[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true } }));
// Stable like the real context's value (a fresh object each render would re-run the screen's effect forever).
const mockActive = { activeProfile: { id: 'p1' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockActive }));
jest.mock('@/data/progress', () => ({ fetchWeakestWordGroups: (...a: unknown[]) => mockWeakest(...a) }));
jest.mock('@/data/favorites', () => ({ fetchFavoriteWordGroups: (...a: unknown[]) => mockFavorites(...a) }));
jest.mock('@/data/content', () => ({
  fetchLessonMap: (...a: unknown[]) => mockLessonMap(...a),
  fetchWordGroupsForLesson: (...a: unknown[]) => mockLessonGroups(...a),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 10 })) }));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/components/session/SessionRunner', () => ({
  SessionRunner: (props: Record<string, unknown>) => {
    mockRunnerProps.push(props);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>[session runner]</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ListeningPractice = require('../../../app/listening-practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <ListeningPractice />
    </ThemeProvider>
  );

beforeEach(() => {
  mockRunnerProps.length = 0;
  mockWeakest.mockReset().mockResolvedValue([]);
  mockFavorites.mockReset().mockResolvedValue([]);
  mockLessonMap.mockReset().mockResolvedValue([{ lessons: [{ id: 'l1', state: 'unlocked' }] }]);
  mockLessonGroups.mockReset().mockResolvedValue([]);
});

it('with enough native recordings: a listening-only session on the daily goal', async () => {
  mockWeakest.mockResolvedValue([makeGroup('a', { listenable: true }), makeGroup('b', { listenable: true })]);
  mockFavorites.mockResolvedValue([makeGroup('b', { listenable: true }), makeGroup('c', { listenable: true })]);
  await renderScreen();

  expect(await screen.findByText('[session runner]')).toBeOnTheScreen();
  const props = mockRunnerProps[mockRunnerProps.length - 1];
  expect(props.exerciseMode).toBe('listening');
  expect(props.goalMinutes).toBe(10);
  expect(props.profileId).toBe('p1');
  expect((props.groups as { id: string }[]).map((g) => g.id).sort()).toEqual(['a', 'b', 'c']);
});

it('tops up from the current lesson when the learner’s own words aren’t enough', async () => {
  mockWeakest.mockResolvedValue([makeGroup('a', { listenable: true })]);
  mockLessonGroups.mockResolvedValue([makeGroup('x', { listenable: true }), makeGroup('y', { listenable: true })]);
  await renderScreen();

  expect(await screen.findByText('[session runner]')).toBeOnTheScreen();
  expect(mockLessonGroups).toHaveBeenCalledWith('l1');
});

it('without enough native recordings: an empty state, not a broken session', async () => {
  mockWeakest.mockResolvedValue([makeGroup('a', { listenable: true }), makeGroup('silent')]);
  await renderScreen();

  expect(await screen.findByText(/not enough native recordings yet/i)).toBeOnTheScreen();
  expect(mockRunnerProps).toHaveLength(0);
});
