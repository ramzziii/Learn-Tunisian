// The learner's path now sits on Home, under Today's Practice and Review:
// the curriculum map (unchanged — same order, same locks), progress, the
// Continue card and — before any lesson is completed — Alphabet as a "Start
// here" card. Learn keeps the search bar and "Explore Tunisian" (Alphabet,
// Phrasebook, Grammar Notes, Culture Corner, Ask for a translation).
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockUnits: unknown[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
const mockProfile = { activeProfile: { id: 'p1', name: 'Sam' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
// Real access rules over a fake set of used lessons.
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockClaimed: string[] = [];
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({
    tier: mockTier,
    isResolved: true,
    decide: (_f: string, key: string, opts?: { completed?: boolean }) =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/lib/access/accessRules').decideItemAccess({
        tier: mockTier,
        claimed: new Set(mockClaimed),
        itemKey: key,
        completed: opts?.completed,
      }),
  }),
}));
jest.mock('@/data/content', () => ({ fetchLessonMap: jest.fn(async () => mockUnits) }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'acc-1' } } }) }));
let mockTranslationRequests: { isNewAnswer: boolean }[] = [];
jest.mock('@/data/translationRequests', () => ({
  fetchMyTranslationRequests: jest.fn(async () => mockTranslationRequests),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 10 })) }));
jest.mock('@/data/sessionLogs', () => ({ fetchMinutesLearnedToday: jest.fn(async () => 3) }));
jest.mock('@/data/progress', () => ({
  fetchReviewDueCount: jest.fn(async () => 0),
  fetchProgressSummary: jest.fn(async () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 })),
}));
// The map itself is unchanged; this stand-in just shows its lessons in order
// with their state and premium lock, and opens one like the real map does.
jest.mock('@/components/lesson-map/UnitSection', () => ({
  UnitSection: ({
    unitWithLessons,
    onSelectLesson,
    isPremiumLocked,
  }: {
    unitWithLessons: { unit: { name: string }; lessons: { id: string; title: string; state: string }[] };
    onSelectLesson: (id: string) => void;
    isPremiumLocked: (id: string) => boolean;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pressable, Text } = require('react-native');
    return unitWithLessons.lessons.map((l) => (
      <Pressable key={l.id} onPress={() => onSelectLesson(l.id)}>
        <Text>{`[lesson ${l.title} ${l.state}${isPremiumLocked(l.id) ? ' premium' : ''}]`}</Text>
      </Pressable>
    ));
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Learn = require('../../../app/(tabs)/learn').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Home = require('../../../app/(tabs)/home').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const lesson = (id: string, n: number, state: string) => ({
  id,
  unitId: 'u1',
  unitName: 'Basics',
  lessonNumber: n,
  sortOrder: n,
  title: `L${n}`,
  state,
  wordCount: 4,
  masteredCount: state === 'completed' ? 4 : 0,
});
const unitsWith = (...lessons: ReturnType<typeof lesson>[]) => [
  { unit: { id: 'u1', name: 'Basics', sortOrder: 1, isCurriculum: true }, lessons },
];

const renderLearn = () => render(<ThemeProvider><Learn /></ThemeProvider>);
const renderHome = () => render(<ThemeProvider><Home /></ThemeProvider>);

beforeEach(() => {
  mockPush.mockReset();
  mockTier = 'free';
  mockClaimed = [];
  mockTranslationRequests = [];
  mockUnits = unitsWith(lesson('l1', 1, 'unlocked'), lesson('l2', 2, 'locked'));
});

it('keeps the curriculum map: same lessons, order and states; nothing locked while lessons are left', async () => {
  await renderHome();
  expect(await screen.findByText('[lesson L1 unlocked]')).toBeOnTheScreen();
  expect(screen.getByText('[lesson L2 locked]')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('[lesson L1 unlocked]'));
  expect(mockPush).toHaveBeenCalledWith('/lesson/l1');
});

it('free account with all 5 lessons used: new lessons show the lock; opened and completed ones stay open', async () => {
  mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'unlocked'), lesson('l3', 3, 'locked'));
  mockClaimed = ['x1', 'x2', 'x3', 'x4', 'l2'];
  await renderHome();
  expect(await screen.findByText('[lesson L1 completed]')).toBeOnTheScreen();
  expect(screen.getByText('[lesson L2 unlocked]')).toBeOnTheScreen();
  expect(screen.getByText('[lesson L3 locked premium]')).toBeOnTheScreen();
});

it('a search bar at the top of Learn opens the dictionary', async () => {
  await renderLearn();
  await fireEvent.press(await screen.findByRole('button', { name: 'Search words' }));
  expect(mockPush).toHaveBeenCalledWith('/search');
});

it('Learn is Explore Tunisian (no lesson path — that is on Home), linking to each reference feature', async () => {
  await renderLearn();
  await screen.findByText('Explore Tunisian');
  expect(screen.queryByText(/\[lesson/)).toBeNull();

  const targets: [string, string][] = [
    ['Alphabet', '/alphabet'],
    ['Phrasebook', '/phrasebook'],
    ['Grammar Notes', '/grammar'],
    ['Culture Corner', '/culture'],
    ['Ask for a translation', '/translation-requests'],
  ];
  for (const [title, href] of targets) {
    mockPush.mockReset();
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${title}\\b`) }));
    expect(mockPush).toHaveBeenCalledWith(href);
  }
});

it('before any lesson is completed: Alphabet as a Start here card near the top', async () => {
  await renderHome();
  const startHere = await screen.findByRole('button', { name: /^Start here: Alphabet/ });
  const texts = screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join(''));
  expect(texts.findIndex((t) => t === 'Start here')).toBeLessThan(texts.findIndex((t) => t.includes('[lesson L1')));
  await fireEvent.press(startHere);
  expect(mockPush).toHaveBeenCalledWith('/alphabet');
});

it('once a lesson is completed, no Start here card', async () => {
  mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'unlocked'));
  await renderHome();
  await screen.findByText('[lesson L1 completed]');
  expect(screen.queryByText('Start here')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Start here/ })).toBeNull();
});

it('Ask for a translation keeps its “translation is ready” notice (moved from Profile)', async () => {
  mockTranslationRequests = [{ isNewAnswer: true }, { isNewAnswer: false }];
  await renderLearn();
  expect(await screen.findByText('🔔 Your translation is ready')).toBeOnTheScreen();
});

it('no notice when nothing new has been answered', async () => {
  await renderLearn();
  await screen.findByText('Explore Tunisian');
  expect(screen.queryByText(/translation.* ready/)).toBeNull();
});

describe('the path on Home', () => {
  it('a hero with overall progress: how many lessons are complete', async () => {
    mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'unlocked'), lesson('l3', 3, 'locked'));
    await renderHome();
    expect(await screen.findByText('1 of 3 lessons complete')).toBeOnTheScreen();
  });

  it('a brand-new learner gets a “Start your first lesson” card that opens it', async () => {
    await renderHome();
    await fireEvent.press(await screen.findByRole('button', { name: /^Start your first lesson: L1/ }));
    expect(mockPush).toHaveBeenCalledWith('/lesson/l1');
  });

  it('a returning learner gets a Continue card for the lesson that’s up next', async () => {
    mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'unlocked'), lesson('l3', 3, 'locked'));
    mockTier = 'premium';
    await renderHome();
    await fireEvent.press(await screen.findByRole('button', { name: /^Continue: L2/ }));
    expect(mockPush).toHaveBeenCalledWith('/lesson/l2');
  });

  it('free account past its 5 lessons: the Continue card opens the upgrade flow', async () => {
    mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'unlocked'));
    mockClaimed = ['x1', 'x2', 'x3', 'x4', 'x5'];
    await renderHome();
    await fireEvent.press(await screen.findByRole('button', { name: /^Continue: L2/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
    expect(mockPush).not.toHaveBeenCalledWith('/lesson/l2');
  });

  it('guest past its 2 preview lessons: the Continue card explains a free account', async () => {
    mockTier = 'guest';
    mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'unlocked'));
    mockClaimed = ['x1', 'x2'];
    await renderHome();
    await fireEvent.press(await screen.findByRole('button', { name: /^Continue: L2/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
  });

  it('when every lesson is done, a celebration instead of a Continue card', async () => {
    mockUnits = unitsWith(lesson('l1', 1, 'completed'), lesson('l2', 2, 'completed'));
    await renderHome();
    expect(await screen.findByText('Every lesson complete 🎉')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Continue/ })).toBeNull();
  });
});

it('the Continue card doesn’t repeat the unit name when the lesson is titled after it', async () => {
  mockUnits = [
    {
      unit: { id: 'u1', name: 'Colors', sortOrder: 1, isCurriculum: true },
      lessons: [{ ...lesson('l1', 1, 'unlocked'), unitName: 'Colors', title: 'Colors' }],
    },
  ];
  await renderHome();
  expect(await screen.findByRole('button', { name: /^Start your first lesson: Colors\. Lesson 1$/ })).toBeOnTheScreen();
});

it('Home: Today’s Practice first, then the path (Your path, Your units)', async () => {
  await renderHome();
  await screen.findByText('Your units');
  const texts = screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join(''));
  const practice = texts.findIndex((t) => t === 'Today’s Practice');
  expect(practice).toBeGreaterThanOrEqual(0);
  expect(texts.findIndex((t) => t === 'Your path')).toBeGreaterThan(practice);
  expect(texts.findIndex((t) => t === 'Your units')).toBeGreaterThan(texts.findIndex((t) => t === 'Your path'));
});
