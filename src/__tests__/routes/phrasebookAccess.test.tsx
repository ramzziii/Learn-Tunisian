// Phrasebook: a category counts as one item when first opened.
// - list: a category shows the lock only once the allowance is used up (and
//   never one already opened); tapping a locked one → upgrade (free) or the
//   create-account prompt (guest);
// - category screen: opened through the access layer before its phrases load;
// - phrase flashcards (practice, not counted): only phrases from categories
//   already opened (all for Premium); never fetches the others.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockClaimed: string[] = [];
const mockOpen = jest.fn(async () => true);
// Stable identity, like the memoized real one (screens reload when it changes).
const mockDecide = (_f: string, key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@/lib/access/accessRules').decideItemAccess({ tier: mockTier, claimed: new Set(mockClaimed), itemKey: key });
const mockDefaultWords = async (lessonId: string) => [
  { id: `${lessonId}-w`, englishMeaning: `meaning ${lessonId}`, variants: [] as unknown[] },
];
const mockFetchWords = jest.fn(mockDefaultWords);

const mockCategories = ['greetings', 'food', 'travel', 'shopping', 'family', 'health'].map((name, i) => ({
  unitId: `pb-${name}`,
  lessonId: `pl-${name}`,
  name: name[0].toUpperCase() + name.slice(1),
  sortOrder: 100 + i,
  phraseCount: 3,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ categoryId: 'pb-family' }),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() }), useAudioPlayerStatus: () => ({ playing: false }), setAudioModeAsync: jest.fn(), getRecordingPermissionsAsync: jest.fn(), requestRecordingPermissionsAsync: jest.fn(), useAudioRecorder: () => ({}), RecordingPresets: {} }));
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
  }),
}));
jest.mock('@/data/content', () => ({
  fetchPhrasebookCategories: jest.fn(async () => mockCategories),
  fetchWordGroupsForLesson: (lessonId: string) => mockFetchWords(lessonId),
}));
jest.mock('@/lib/phrasebookProgress', () => ({ getViewedPhraseIds: jest.fn(async () => []), markPhraseViewed: jest.fn() }));
jest.mock('@/lib/display/useDisplayPreferences', () => ({
  useDisplayPreferences: () => ({ preferences: { script: 'both', form: 'default' } }),
}));
const mockSpeak = jest.fn();
jest.mock('expo-speech', () => ({ speak: (...a: unknown[]) => mockSpeak(...a), stop: jest.fn() }));
let mockAudio: { play: jest.Mock; hasAudio: boolean; source: string | null } = { play: jest.fn(), hasAudio: false, source: null };
jest.mock('@/hooks/useWordAudioPlayer', () => ({ useWordAudioPlayer: () => mockAudio }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => {
  mockPush.mockReset();
  mockTier = 'free';
  mockClaimed = [];
  mockOpen.mockReset().mockResolvedValue(true);
  mockFetchWords.mockReset().mockImplementation(mockDefaultWords);
  mockSpeak.mockClear();
  mockAudio = { play: jest.fn(), hasAudio: false, source: null };
});

describe('category list', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Phrasebook = require('../../../app/phrasebook/index').default;

  it('nothing locked while categories are left; tapping opens the category', async () => {
    await themed(<Phrasebook />);
    await fireEvent.press(await screen.findByText('Health'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/phrasebook/[categoryId]', params: { categoryId: 'pb-health' } });
    expect(screen.queryByLabelText('Premium')).toBeNull();
  });

  it('free with 5 used: unopened categories are locked → upgrade; opened ones still open', async () => {
    mockClaimed = ['pb-greetings', 'pb-food', 'pb-travel', 'pb-shopping', 'pb-family'];
    await themed(<Phrasebook />);
    expect(await screen.findAllByLabelText('Premium')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Health'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding/plans', params: { source: 'premium' } });
    await fireEvent.press(screen.getByText('Family'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/phrasebook/[categoryId]', params: { categoryId: 'pb-family' } });
  });

  it('guest past 2: a locked category explains a free account', async () => {
    mockTier = 'guest';
    mockClaimed = ['pb-greetings', 'pb-food'];
    await themed(<Phrasebook />);
    await fireEvent.press(await screen.findByText('Travel'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
  });
});

describe('category screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Category = require('../../../app/phrasebook/[categoryId]').default;

  it('opens the category through the access layer, then loads its phrases', async () => {
    await themed(<Category />);
    expect(await screen.findByText('meaning pl-family')).toBeOnTheScreen();
    expect(mockOpen).toHaveBeenCalledWith('phrasebook_category', 'pb-family');
  });

  it('at the limit: the gate, and the phrases are never requested', async () => {
    mockOpen.mockResolvedValue(false);
    await themed(<Category />);
    expect(await screen.findByText(/used your 5 free phrasebook categories/i)).toBeOnTheScreen();
    expect(mockFetchWords).not.toHaveBeenCalled();
  });
});

describe('phrase flashcards (practice — not counted)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Flashcards = require('../../../app/phrasebook/flashcards').default;

  it('free: only phrases from categories already opened; nothing is claimed', async () => {
    mockClaimed = ['pb-greetings', 'pb-food'];
    await themed(<Flashcards />);
    await screen.findAllByText(/meaning pl-/);
    expect(mockFetchWords.mock.calls.map((c) => c[0]).sort()).toEqual(['pl-food', 'pl-greetings']);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('Premium: every category', async () => {
    mockTier = 'premium';
    await themed(<Flashcards />);
    await screen.findAllByText(/meaning pl-/);
    expect(mockFetchWords).toHaveBeenCalledTimes(mockCategories.length);
  });

  describe('audio', () => {
    beforeEach(() => {
      mockClaimed = ['pb-greetings'];
      mockFetchWords.mockImplementation(async (lessonId: string) => [
        {
          id: `${lessonId}-w`,
          englishMeaning: `meaning ${lessonId}`,
          variants: [{ id: 'v1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: 'a.m4a' }],
        },
      ]);
    });

    it('the computer voice is labelled as not Tunisian and plays only when tapped', async () => {
      mockAudio = { play: jest.fn(), hasAudio: true, source: 'computer' };
      await themed(<Flashcards />);
      expect(await screen.findByText('Computer voice — not a Tunisian speaker')).toBeOnTheScreen();
      expect(mockAudio.play).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByText('▶ Tap to hear it'));
      expect(mockAudio.play).toHaveBeenCalled();
    });

    it('no recording: says so, and never uses the phone’s voice', async () => {
      await themed(<Flashcards />);
      expect(await screen.findByText('No recording yet')).toBeOnTheScreen();
      await fireEvent.press(screen.getByText('No recording yet'));
      expect(mockSpeak).not.toHaveBeenCalled();
    });
  });
});
