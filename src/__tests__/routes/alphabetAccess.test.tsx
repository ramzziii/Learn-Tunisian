// Alphabet screens with the letter allowance (guest 2, free 5, Premium all):
// - letter grid: any letter can be picked; opening counts it; past the limit
//   an unopened letter shows the lock and → upgrade / create-account;
// - Speed Match: needs 3 open letters — a guest gets the create-account
//   prompt; Premium plays unlimited rounds (no more one-round sample).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ARABIC_LETTERS } from '@/lib/alphabet';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockClaimed: string[] = [];
const mockOpen = jest.fn(async () => true);
const mockDecide = (_f: string, key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@/lib/access/accessRules').decideItemAccess({ tier: mockTier, claimed: new Set(mockClaimed), itemKey: key });
const mockClaimedSet = () => new Set(mockClaimed);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
const mockProfile = { activeProfile: { id: 'p1' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({
    tier: mockTier,
    isResolved: true,
    loadError: false,
    open: mockOpen,
    decide: mockDecide,
    claimed: mockClaimedSet,
  }),
}));
jest.mock('@/hooks/useLetterSpeech', () => ({ useLetterSpeech: () => ({ speak: jest.fn(), isSpeaking: false }) }));
jest.mock('@/hooks/useAnswerFeedback', () => ({ useAnswerFeedback: () => ({ playCorrect: jest.fn(), playIncorrect: jest.fn() }) }));
jest.mock('@/lib/alphabetProgress', () => ({
  getAlphabetProgress: jest.fn(async () => ({ practicedLetterIds: [], viewedLetterIds: [], viewedDiacriticLetterIds: [] })),
  markLetterViewed: jest.fn(),
  markDiacriticLetterViewed: jest.fn(),
  markLettersPracticed: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => {
  mockPush.mockReset();
  mockTier = 'free';
  mockClaimed = [];
  mockOpen.mockReset().mockResolvedValue(true);
});

describe('letter grid', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Alphabet = require('../../../app/alphabet').default;
  const letter = ARABIC_LETTERS[15];

  it('any letter can be picked; opening counts it', async () => {
    await themed(<Alphabet />);
    await fireEvent.press(screen.getAllByText(letter.label)[0]);
    expect(mockOpen).toHaveBeenCalledWith('alphabet_letter', letter.id);
  });

  it('past the limit: unopened letters show the lock; tapping → upgrade', async () => {
    mockClaimed = ARABIC_LETTERS.slice(0, 5).map((l) => l.id);
    mockOpen.mockResolvedValue(false);
    await themed(<Alphabet />);
    expect(screen.getAllByLabelText('Premium').length).toBe(ARABIC_LETTERS.length - 5);
    await fireEvent.press(screen.getAllByText(letter.label)[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
  });
});

describe('Speed Match', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Matching = require('../../../app/alphabet-matching').default;

  it('guest (2 letters, needs 3): the create-account prompt, nothing claimed', async () => {
    mockTier = 'guest';
    await themed(<Matching />);
    expect(await screen.findByText('Create a free account to keep learning')).toBeOnTheScreen();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('free with letters open: a round starts (no one-round sample limit)', async () => {
    mockClaimed = ARABIC_LETTERS.slice(0, 4).map((l) => l.id);
    await themed(<Matching />);
    expect(await screen.findByText(/Your open letters · 4 pairs/)).toBeOnTheScreen();
    expect(screen.queryByText(/Keep playing with Premium/)).toBeNull();
  });
});
