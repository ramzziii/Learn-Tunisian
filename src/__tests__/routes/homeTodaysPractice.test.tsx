// Home answers "what should I do now?" with one primary action — Start
// today's practice — plus a "N words due" link to Review only when
// something is due, then the learner's path (Continue card, units). The
// greeting and today's minutes toward the goal stay. No challenges
// checklist, no quick-action row, no 🔥 day count.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockProfile = { id: 'p1', name: 'Ramzi' };
let mockSummary = { wordsLearning: 2, wordsMastered: 1, wordsReviewed: 0, totalWordsSeen: 3 };
let mockDue = 2;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: mockRouter,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
let mockTier: 'guest' | 'free' = 'free';
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: mockTier, isResolved: true, decide: () => 'open' }) }));
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
  fetchProgressSummary: jest.fn(async () => mockSummary),
  fetchReviewDueCount: jest.fn(async () => mockDue),
  fetchTodayPracticeSummary: jest.fn(async () => ({ wordsPracticedToday: 0, wordsMasteredToday: 0 })),
}));
jest.mock('@/data/sessionLogs', () => ({
  fetchMinutesLearnedToday: jest.fn(async () => 4),
  fetchRecentActivityDates: jest.fn(async () => ['2026-10-29', '2026-10-30']),
}));
jest.mock('@/lib/dailyChallengeProgress', () => ({
  getTodayChallengeFlags: jest.fn(async () => ({ reviewCompleted: false, speakingCompleted: false })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Home = require('../../../app/(tabs)/home').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderHome = () => render(<ThemeProvider><Home /></ThemeProvider>);

beforeEach(() => {
  mockRouter.push.mockReset();
  mockSummary = { wordsLearning: 2, wordsMastered: 1, wordsReviewed: 0, totalWordsSeen: 3 };
  mockDue = 2;
});

describe('a returning learner', () => {
  it('greeting, today’s minutes, and one primary action: Start today’s practice', async () => {
    await renderHome();
    expect(await screen.findByText('Start today’s practice')).toBeOnTheScreen();
    expect(screen.getByText('Ahla, Ramzi!')).toBeOnTheScreen();
    expect(screen.getByText("Today's goal: 4 / 10 min")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Start today’s practice' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/todays-practice');
  });

  it('a quiet “N words due” link opens Review', async () => {
    await renderHome();
    const link = await screen.findByRole('link', { name: /2 words due/ });
    await fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenCalledWith('/review');
    expect(screen.queryByText(/behind|overdue|don.t lose/i)).toBeNull();
  });

  it('one word due reads naturally', async () => {
    mockDue = 1;
    await renderHome();
    expect(await screen.findByRole('link', { name: /1 word due/ })).toBeOnTheScreen();
  });

  it('nothing due: no review link', async () => {
    mockDue = 0;
    await renderHome();
    await screen.findByText('Start today’s practice');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/due/)).toBeNull();
  });

  it('no challenges checklist, quick actions, recommendation card or 🔥 day count', async () => {
    await renderHome();
    await screen.findByText('Start today’s practice');
    expect(screen.queryByText('Today’s challenges')).toBeNull();
    expect(screen.queryByText(/Today's challenges/)).toBeNull();
    expect(screen.queryByText(/🔥/)).toBeNull();
    expect(screen.queryByText('Recommended next')).toBeNull();
    for (const quick of ['Practice', 'Talk', 'Review']) expect(screen.queryByText(quick)).toBeNull();
  });

  it('under Today’s Practice and Review: the path, with a Continue card for the next lesson', async () => {
    await renderHome();
    expect(await screen.findByText('Your units')).toBeOnTheScreen();
    expect(screen.getByText('Your path')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Start your first lesson: Hello/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/lesson/l1');
  });
});

describe('a brand-new learner', () => {
  it('the same single action — today’s practice starts with their first lesson’s words', async () => {
    mockSummary = { wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 };
    mockDue = 0;
    await renderHome();
    expect(await screen.findByText('Start today’s practice')).toBeOnTheScreen();
    expect(screen.queryByRole('link')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start today’s practice' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/todays-practice');
  });
});

describe('a guest (device-only preview)', () => {
  afterEach(() => {
    mockTier = 'free';
  });

  it('no goal; the path’s “Start your first lesson” card opens the first preview lesson', async () => {
    mockTier = 'guest';
    await renderHome();
    await fireEvent.press(await screen.findByRole('button', { name: /^Start your first lesson: Hello/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/lesson/l1');
    expect(screen.queryByText(/Today.s goal/)).toBeNull();
    expect(screen.queryByText('Start today’s practice')).toBeNull();
  });

  it('while the lessons are still loading, there is no lesson card to tap yet', async () => {
    mockTier = 'guest';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/data/content').fetchLessonMap.mockReturnValueOnce(new Promise(() => undefined));
    await renderHome();
    expect(screen.queryByRole('button', { name: /^Start your first lesson/ })).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('offers a free account without pressure', async () => {
    mockTier = 'guest';
    await renderHome();
    await fireEvent.press(await screen.findByRole('button', { name: 'Create a free account' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/age');
  });
});
