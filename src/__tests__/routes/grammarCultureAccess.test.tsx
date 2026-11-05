// Grammar Notes: guests get sentence order; free accounts add present tense
// and questions; never counted. Every other note is Premium — locked, never rendered, tapping → upgrade (free) or the
// create-account prompt (guest). Culture Corner: guests and free accounts pick
// any proverbs (2 / 5 in total); each counts when first opened. Premium opens all.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GRAMMAR_NOTES } from '@/constants/grammarNotes';
import { PROVERBS } from '@/constants/proverbs';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockClaimed: string[] = [];
const mockOpen = jest.fn(async () => true);
const mockDecide = (feature: string, key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@/lib/access/accessRules').decideItemAccess({ tier: mockTier, claimed: new Set(mockClaimed), itemKey: key, feature });

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
  useAccess: () => ({ tier: mockTier, isResolved: true, loadError: false, open: mockOpen, decide: mockDecide }),
}));
jest.mock('@/hooks/useLetterSpeech', () => ({ useLetterSpeech: () => ({ speak: jest.fn(), isSpeaking: false }) }));
jest.mock('@/lib/display/useDisplayPreferences', () => ({
  useDisplayPreferences: () => ({ preferences: { script: 'both', form: 'default' } }),
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

describe('Grammar Notes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Grammar = require('../../../app/grammar').default;
  const note = (id: string) => GRAMMAR_NOTES.find((n) => n.id === id)!;
  const FREE = ['sentence_order', 'present_verbs', 'questions'];
  const premiumOnly = GRAMMAR_NOTES.filter((n) => !FREE.includes(n.id));

  it('free: only sentence order, present tense and questions are open; the rest show Premium', async () => {
    await themed(<Grammar />);
    expect(screen.getAllByLabelText('Premium').length).toBe(premiumOnly.length);
    expect(screen.getByText(note('sentence_order').explanation)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(note('questions').title));
    expect(await screen.findByText(note('questions').explanation)).toBeOnTheScreen();
  });

  it('guest: only sentence order is open; present tense and questions are locked → create a free account', async () => {
    mockTier = 'guest';
    await themed(<Grammar />);
    expect(screen.getAllByLabelText('Premium').length).toBe(GRAMMAR_NOTES.length - 1);
    expect(screen.getByText(note('sentence_order').explanation)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(note('present_verbs').title));
    expect(screen.queryByText(note('present_verbs').explanation)).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
  });

  it('free: a Premium note is never rendered; tapping it → upgrade, without trying to open it', async () => {
    await themed(<Grammar />);
    const locked = note('past_tense');
    await fireEvent.press(screen.getByText(locked.title));
    expect(screen.queryByText(locked.explanation)).toBeNull();
    expect(mockOpen).not.toHaveBeenCalledWith('grammar_note', locked.id);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
  });

  it('guest: tapping a Premium note explains a free account', async () => {
    mockTier = 'guest';
    await themed(<Grammar />);
    await fireEvent.press(screen.getByText(note('negation').title));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
  });

  it('Premium: every note is open, no locks', async () => {
    mockTier = 'premium';
    await themed(<Grammar />);
    expect(screen.getByText(GRAMMAR_NOTES[0].explanation)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Premium')).toBeNull();
    await fireEvent.press(screen.getByText(note('past_tense').title));
    expect(await screen.findByText(note('past_tense').explanation)).toBeOnTheScreen();
  });
});

describe('Culture Corner', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Culture = require('../../../app/culture').default;
  const proverb = PROVERBS[7];

  it('any proverb can be picked; opening counts it', async () => {
    await themed(<Culture />);
    await fireEvent.press(screen.getAllByText(proverb.transliteration)[0]);
    expect(mockOpen).toHaveBeenCalledWith('proverb', proverb.id);
  });

  it('past the limit: tapping an unopened proverb → upgrade, not the proverb', async () => {
    mockClaimed = PROVERBS.slice(0, 5).map((p) => p.id);
    mockOpen.mockResolvedValue(false);
    await themed(<Culture />);
    expect(screen.getAllByLabelText('Premium').length).toBe(PROVERBS.length - 5);
    await fireEvent.press(screen.getAllByText(proverb.transliteration)[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
    expect(screen.queryByText(proverb.meaning)).toBeNull();
  });
});
