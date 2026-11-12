// Profile left the tab bar: every tab (Home, Learn, Practice, Talk) has the
// same account button at the top right — the learner's initial, or a person
// icon for a guest — labelled "Profile and settings", opening /profile.
// (Profile's own back button is tested in profileAdminEntry.test.tsx.)
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockProfile: { id: string; name: string } | null = { id: 'p1', name: 'ramzi' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useCanGoBack: () => true,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({ tier: mockTier, isResolved: true, decide: () => 'open' }),
}));
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: mockProfile }) }));
jest.mock('@/data/content', () => ({ fetchLessonMap: jest.fn(async () => []) }));
jest.mock('@/data/progress', () => ({
  fetchProgressSummary: jest.fn(async () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 })),
  fetchReviewDueCount: jest.fn(async () => 0),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => ({ dailyGoalMinutes: 5 })) }));
jest.mock('@/data/sessionLogs', () => ({ fetchMinutesLearnedToday: jest.fn(async () => 0) }));
jest.mock('@/components/translation/TranslationRequestsEntry', () => ({
  translationReadyText: () => null,
  useNewTranslationAnswers: () => 0,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AccountButton, avatarInitial } = require('@/components/account/AccountButton');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

beforeEach(() => {
  mockPush.mockReset();
  mockTier = 'free';
  mockProfile = { id: 'p1', name: 'ramzi' };
});

describe('the account button', () => {
  it('signed in: the learner’s initial, labelled “Profile and settings”, opens /profile', async () => {
    await wrap(<AccountButton />);
    expect(screen.getByText('R')).toBeOnTheScreen();
    expect(screen.queryByText('👤')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('a guest sees a person icon and gets the same /profile route (its create-account explanation)', async () => {
    mockTier = 'guest';
    mockProfile = { id: 'guest', name: 'Guest' };
    await wrap(<AccountButton />);
    expect(screen.getByText('👤', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('G')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Profile and settings' }));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('the initial is the first letter, trimmed and uppercased; no name falls back to the icon', async () => {
    expect(avatarInitial('  sam')).toBe('S');
    expect(avatarInitial('émna')).toBe('É');
    expect(avatarInitial('')).toBe('');
    mockProfile = { id: 'p1', name: '' };
    await wrap(<AccountButton />);
    expect(screen.getByText('👤', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe('each of the four tabs has it, once', () => {
  const tabs: [string, string][] = [
    ['Home', '../../../app/(tabs)/home'],
    ['Learn', '../../../app/(tabs)/learn'],
    ['Practice', '../../../app/(tabs)/practice'],
    ['Talk', '../../../app/(tabs)/talk'],
  ];
  it.each(tabs)('%s', async (_name, path) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabScreen = require(path).default;
    await wrap(<TabScreen />);
    expect(await screen.findAllByRole('button', { name: 'Profile and settings' })).toHaveLength(1);
  });

  it('Talk stays visible for a free account, with its Premium lock', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Talk = require('../../../app/(tabs)/talk').default;
    await wrap(<Talk />);
    expect(screen.getByText(/Talk is part of Premium/)).toBeOnTheScreen();
  });
});
