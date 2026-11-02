// Grammar Notes and Culture Corner: guests and free accounts pick any notes /
// proverbs (2 / 5 in total); each counts when first opened. Past the limit an
// unopened item shows the lock and its content is never rendered; tapping it
// → upgrade (free) or the create-account prompt (guest). Premium opens all.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GRAMMAR_NOTES } from '@/constants/grammarNotes';
import { PROVERBS } from '@/constants/proverbs';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockClaimed: string[] = [];
const mockOpen = jest.fn(async () => true);
const mockDecide = (_f: string, key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@/lib/access/accessRules').decideItemAccess({ tier: mockTier, claimed: new Set(mockClaimed), itemKey: key });

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
  const [first, second] = GRAMMAR_NOTES;

  it('nothing is counted just by opening the screen', async () => {
    await themed(<Grammar />);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(screen.queryByText(first.explanation)).toBeNull();
  });

  it('any note can be picked; opening it counts it, then shows it', async () => {
    await themed(<Grammar />);
    await fireEvent.press(screen.getByText(second.title));
    expect(mockOpen).toHaveBeenCalledWith('grammar_note', second.id);
    expect(await screen.findByText(second.explanation)).toBeOnTheScreen();
  });

  it('past the limit: an unopened note is locked, never rendered, and tapping → upgrade', async () => {
    mockClaimed = GRAMMAR_NOTES.slice(2, 7).map((n) => n.id);
    mockOpen.mockResolvedValue(false);
    await themed(<Grammar />);
    expect(screen.getAllByLabelText('Premium').length).toBe(GRAMMAR_NOTES.length - 5);
    await fireEvent.press(screen.getByText(first.title));
    expect(screen.queryByText(first.explanation)).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
  });

  it('guest at the limit: tapping explains a free account', async () => {
    mockTier = 'guest';
    mockClaimed = [GRAMMAR_NOTES[3].id, GRAMMAR_NOTES[4].id];
    mockOpen.mockResolvedValue(false);
    await themed(<Grammar />);
    await fireEvent.press(screen.getByText(first.title));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
  });

  it('Premium: the first note starts open, no locks', async () => {
    mockTier = 'premium';
    await themed(<Grammar />);
    expect(screen.getByText(first.explanation)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Premium')).toBeNull();
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
