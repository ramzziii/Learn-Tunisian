// Home: a Today's Practice card sits right below the daily goal and starts
// the guided session. Practice tab: individual activities are unchanged.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockProfile = { id: 'p1', name: 'Ramzi' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: mockRouter }));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: mockProfile }) }));
jest.mock('@/data/content', () => ({
  fetchLessonMap: jest.fn(async () => [
    {
      unit: { id: 'u1', name: 'Basics', sortOrder: 1, isCurriculum: true },
      lessons: [{ id: 'l1', unitId: 'u1', unitName: 'Basics', lessonNumber: 1, sortOrder: 1, title: 'Hello', state: 'unlocked', wordCount: 4, masteredCount: 0 }],
    },
  ]),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 10 })) }));
jest.mock('@/data/progress', () => ({
  fetchProgressSummary: jest.fn(async () => ({ wordsLearning: 2, wordsMastered: 1, wordsReviewed: 0, totalWordsSeen: 3 })),
  fetchReviewDueCount: jest.fn(async () => 2),
  fetchTodayPracticeSummary: jest.fn(async () => ({ wordsPracticedToday: 0, wordsMasteredToday: 0 })),
}));
jest.mock('@/data/sessionLogs', () => ({
  fetchMinutesLearnedToday: jest.fn(async () => 4),
  fetchRecentActivityDates: jest.fn(async () => []),
}));
jest.mock('@/lib/dailyChallengeProgress', () => ({
  getTodayChallengeFlags: jest.fn(async () => ({ reviewCompleted: false, speakingCompleted: false })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Home = require('../../../app/(tabs)/home').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticeHub = require('../../../app/(tabs)/practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const withTheme = (node: React.ReactNode) => <ThemeProvider>{node}</ThemeProvider>;

beforeEach(() => mockRouter.push.mockReset());

it('shows Today’s Practice with one clear start action, right below the daily goal', async () => {
  await render(withTheme(<Home />));

  expect(await screen.findByText('Today’s Practice')).toBeOnTheScreen();
  expect(screen.getAllByText('Start today’s practice')).toHaveLength(1);

  // Order on screen: greeting → daily goal → Today's Practice → recommendation.
  // Every rendered text, in tree (screen) order.
  const texts = screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join(''));
  const position = (needle: string) => texts.findIndex((t) => t.includes(needle));
  const greeting = position('Ramzi');
  const goal = position("Today's goal");
  const card = position('Start today’s practice');
  const recommendation = position('Recommended next');
  expect(greeting).toBeGreaterThan(-1);
  expect(goal).toBeGreaterThan(greeting);
  expect(card).toBeGreaterThan(goal);
  expect(recommendation).toBeGreaterThan(card);
});

it('starting it opens the guided session', async () => {
  await render(withTheme(<Home />));

  await fireEvent.press(await screen.findByText('Start today’s practice'));

  expect(mockRouter.push).toHaveBeenCalledWith('/todays-practice');
});

it('keeps the existing goal card (minutes / goal) intact', async () => {
  await render(withTheme(<Home />));
  expect(await screen.findByText('4 / 10 min')).toBeOnTheScreen();
});

describe('Practice tab (unchanged)', () => {
  it('still lists every individual activity, and no Today’s Practice entry', async () => {
    await render(withTheme(<PracticeHub />));

    for (const title of [
      'Phrasebook',
      'Flashcards',
      'Grammar Notes',
      // Repeat After Me is reached through Speaking Practice now (app/speaking.tsx).
      'Speaking Practice',
      'Alphabet Practice',
      'Review',
      'Culture Corner',
    ]) {
      expect(screen.getByText(title)).toBeOnTheScreen();
    }
    expect(screen.queryByText(/Today.s Practice/)).toBeNull();
  });

  it('activities still launch individually', async () => {
    await render(withTheme(<PracticeHub />));
    await fireEvent.press(screen.getByText('Review'));
    expect(mockRouter.push).toHaveBeenCalledWith('/review');
    await fireEvent.press(screen.getByText('Speaking Practice'));
    expect(mockRouter.push).toHaveBeenCalledWith('/speaking');
  });
});
