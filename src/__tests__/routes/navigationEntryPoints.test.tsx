// Entry points that must keep working after the navigation reorganisation:
// - Phrasebook links to its browse-and-listen phrase cards;
// - Review loads the due words (practice isn't counted — no daily allowance;
//   which words it may use is tested in practiceAccess.test.tsx);
// - the five tabs are unchanged.
import { fireEvent, render, screen } from '@testing-library/react-native';

declare const __dirname: string;

const mockPush = jest.fn();
const mockFetchReviewQueue = jest.fn();

// Signed-in Premium account with every lesson open (access rules are tested elsewhere).
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: 'premium', isResolved: true, decide: () => 'open', claimed: () => new Set() }) }));
jest.mock('@/lib/access/usePracticeScope', () => ({
  usePracticeScope: () => mockAllScope,
}));
const mockAllScope = { scope: { all: true, lessonKeys: new Set(), unitIds: new Set() }, error: false, reload: () => undefined };
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
jest.mock('@/lib/premium/PremiumContext', () => ({ usePremium: () => ({ isPremium: false, isResolved: true }) }));
jest.mock('@/data/content', () => ({
  fetchPhrasebookCategories: jest.fn(async () => [{ unitId: 'u-cafe', lessonId: 'l-cafe', name: 'At the café', sortOrder: 1, phraseCount: 5 }]),
}));
let mockWordsSeen = 3;
jest.mock('@/data/progress', () => ({
  fetchReviewQueue: (...a: unknown[]) => mockFetchReviewQueue(...a),
  fetchProgressSummary: jest.fn(async () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: mockWordsSeen })),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 5 })) }));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));
jest.mock('@/components/session/SessionRunner', () => ({ SessionRunner: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Phrasebook = require('../../../app/phrasebook/index').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Review = require('../../../app/review').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => {
  mockPush.mockReset();
  mockFetchReviewQueue.mockReset();
  mockFetchReviewQueue.mockResolvedValue([]);
});

it('Phrasebook links to its browse-and-listen phrase cards', async () => {
  await themed(<Phrasebook />);
  await fireEvent.press(await screen.findByRole('button', { name: /^Phrase cards — listen and browse/ }));
  expect(mockPush).toHaveBeenCalledWith('/phrasebook/flashcards');
});

describe('Review', () => {
  it('loads the due words — no daily allowance any more', async () => {
    await themed(<Review />);
    expect(await screen.findByText('All caught up')).toBeOnTheScreen();
    expect(mockFetchReviewQueue).toHaveBeenCalledWith('p1');
  });

  it('a brand-new learner is told there is nothing to review yet (not "all caught up") and pointed to a lesson', async () => {
    mockWordsSeen = 0;
    await themed(<Review />);
    expect(await screen.findByText('Nothing to review yet')).toBeOnTheScreen();
    expect(screen.queryByText('All caught up')).toBeNull();
    mockWordsSeen = 3;
  });
});

it('the five tabs are unchanged: Home, Learn, Practice, Talk, Profile', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('path');
  const layout = readFileSync(join(__dirname, '..', '..', '..', 'app', '(tabs)', '_layout.tsx'), 'utf8');
  const titles = [...layout.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  expect(titles).toEqual(['Home', 'Learn', 'Practice', 'Talk', 'Profile']);
});
