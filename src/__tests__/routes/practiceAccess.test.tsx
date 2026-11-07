// Practice isn't counted, and only uses approved words from lessons /
// categories the learner has open (Premium: all approved words):
// - Review: no daily allowance any more; the queue is filtered to the scope;
// - Word detail: a word outside the scope shows a friendly locked state that
//   hides the word and its meaning;
// - Favorites: lists only words in the scope;
// - Speaking: drills only words in the scope (a guest: at most 2);
// - Listening isn't offered to guests.
// If the scope can't be loaded, an explicit error — never unfiltered words.
import { render, screen, waitFor } from '@testing-library/react-native';

import { buildPracticeScope } from '@/lib/access/practiceScope';

const w = (id: string, unitId: string, lessonNumber = 1, contentStatus = 'approved') => ({
  id,
  unitId,
  lessonNumber,
  contentStatus,
  englishMeaning: `meaning ${id}`,
  variants: [{ id: `${id}-v`, variantLabel: 'primary', wordArabic: 'كلمة', transliteration: `tr-${id}`, audioPath: null }],
});

let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockScopeState: { scope: unknown; error: boolean; reload: () => void } = {
  scope: buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] }),
  error: false,
  reload: jest.fn(),
};
let mockWeakest: unknown[] = [];
let mockFavorites: unknown[] = [];
let mockReviewQueue: unknown[] = [];
let mockWordId = 'in1';

jest.mock('@/components/phraseWords/WordsUsedSection', () => ({
  WordsUsedSection: ({ phraseId }: { phraseId: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`[words used for ${phraseId}]`}</Text>;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ wordGroupId: mockWordId }),
}));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() }), useAudioPlayerStatus: () => ({ playing: false }), setAudioModeAsync: jest.fn(), getRecordingPermissionsAsync: jest.fn(), requestRecordingPermissionsAsync: jest.fn(), useAudioRecorder: () => ({}), RecordingPresets: {} }));
jest.mock('@/lib/supabase/client', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() }, getImageUrl: () => null, getAudioUrl: () => null }));
const mockProfile = { activeProfile: { id: 'p1' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
let mockSearchOpened: string[] = [];
const mockClaimed = (feature: string) => new Set(feature === 'dictionary_result' ? mockSearchOpened : []);
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({ tier: mockTier, isResolved: true, claimed: mockClaimed }),
}));
jest.mock('@/lib/access/usePracticeScope', () => ({ usePracticeScope: () => mockScopeState }));
jest.mock('@/lib/display/useDisplayPreferences', () => ({
  useDisplayPreferences: () => ({ preferences: { script: 'both', form: 'default' } }),
}));
let mockAudioSource: 'native' | 'computer' | null = null;
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: mockAudioSource !== null, source: mockAudioSource, isResolving: false, hasError: false, retry: jest.fn() }),
}));
jest.mock('@/data/progress', () => ({
  fetchWeakestWordGroups: jest.fn(async () => mockWeakest),
  fetchReviewQueue: jest.fn(async () => mockReviewQueue),
  fetchProgressSummary: jest.fn(async () => ({ wordsLearning: 1, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 1 })),
  fetchProgressForWordGroup: jest.fn(async () => null),
  recordWordGroupResult: jest.fn(async () => undefined),
}));
jest.mock('@/data/favorites', () => ({
  fetchFavoriteWordGroups: jest.fn(async () => mockFavorites),
  fetchFavoriteWordGroupIds: jest.fn(async () => new Set()),
  addFavorite: jest.fn(),
  removeFavorite: jest.fn(),
}));
jest.mock('@/data/content', () => ({
  fetchLessonMap: jest.fn(async () => []),
  fetchWordGroupsForLesson: jest.fn(async () => []),
  fetchWordGroupWithSiblings: jest.fn(async (id: string) => ({
    group: id === 'in1' ? w('in1', 'u1') : w('out1', 'u2'),
    siblings: [],
  })),
}));
jest.mock('@/data/profiles', () => ({ fetchDailyGoalSettings: jest.fn(async () => null) }));
jest.mock('@/lib/offline/audioCache', () => ({ prefetchLessonAudio: jest.fn() }));
jest.mock('@/lib/dailyChallengeProgress', () => ({
  markReviewCompletedToday: jest.fn(),
  markSpeakingCompletedToday: jest.fn(),
}));
jest.mock('@/components/session/SessionRunner', () => ({
  SessionRunner: ({ groups }: { groups: { id: string }[] }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`Session: ${groups.map((g) => g.id).join(',')}`}</Text>;
  },
}));
jest.mock('@/components/exercises/shared/ExerciseRenderer', () => ({
  ExerciseRenderer: ({ exercise }: { exercise: { targetGroup: { id: string } } }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`Speaking: ${exercise.targetGroup.id}`}</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);
const ThemeProviderForRerender = ThemeProvider;

beforeEach(() => {
  mockTier = 'free';
  mockScopeState = {
    scope: buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] }),
    error: false,
    reload: jest.fn(),
  };
  mockWeakest = [];
  mockFavorites = [];
  mockReviewQueue = [];
  mockWordId = 'in1';
});

describe('Review', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Review = require('../../../app/review').default;

  it('free: starts straight away (no daily allowance) with only words in the scope', async () => {
    mockReviewQueue = [w('in1', 'u1'), w('out1', 'u2'), w('draft1', 'u1', 1, 'draft'), w('in2', 'u1')];
    await themed(<Review />);
    expect(await screen.findByText('Session: in1,in2')).toBeOnTheScreen();
    expect(screen.queryByText(/free review/i)).toBeNull();
  });

  it('scope can’t load: an explicit error, no session', async () => {
    mockScopeState = { scope: null, error: true, reload: jest.fn() };
    mockReviewQueue = [w('in1', 'u1')];
    await themed(<Review />);
    expect(await screen.findByText(/couldn.t check/i)).toBeOnTheScreen();
    expect(screen.queryByText(/Session:/)).toBeNull();
  });
});

describe('Word detail', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const WordDetail = require('../../../app/word/[wordGroupId]').default;

  it('a word in the scope shows normally, with its "Words used" cards', async () => {
    await themed(<WordDetail />);
    expect(await screen.findByText('meaning in1')).toBeOnTheScreen();
    expect(screen.getByText('[words used for in1]')).toBeOnTheScreen();
  });

  it('guest: a preview word opened from search shows, even outside the lessons opened', async () => {
    mockTier = 'guest';
    mockWordId = 'out1';
    mockSearchOpened = ['out1'];
    try {
      await themed(<WordDetail />);
      expect(await screen.findByText('meaning out1')).toBeOnTheScreen();
    } finally {
      mockSearchOpened = [];
    }
  });

  it('a free account gets no such exception (its search only holds words it can open)', async () => {
    mockWordId = 'out1';
    mockSearchOpened = ['out1'];
    try {
      await themed(<WordDetail />);
      expect(await screen.findByText(/lesson you haven.t opened/i)).toBeOnTheScreen();
    } finally {
      mockSearchOpened = [];
    }
  });

  it('a computer voice is labelled as not Tunisian; a native recording isn’t', async () => {
    mockAudioSource = 'computer';
    try {
      const view = await themed(<WordDetail />);
      expect(await screen.findByText('Computer voice — not a Tunisian speaker')).toBeOnTheScreen();
      mockAudioSource = 'native';
      await view.rerender(<ThemeProviderForRerender><WordDetail /></ThemeProviderForRerender>);
      await waitFor(() => expect(screen.queryByText('Computer voice — not a Tunisian speaker')).toBeNull());
    } finally {
      mockAudioSource = null;
    }
  });

  it('a word outside the scope: a friendly locked state, hiding the word and meaning', async () => {
    mockWordId = 'out1';
    await themed(<WordDetail />);
    expect(await screen.findByText(/lesson you haven.t opened/i)).toBeOnTheScreen();
    expect(screen.queryByText('meaning out1')).toBeNull();
    expect(screen.queryByText(/tr-out1/)).toBeNull();
  });
});

describe('Favorites', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Favorites = require('../../../app/favorites/index').default;

  it('lists only words in the scope', async () => {
    mockFavorites = [w('in1', 'u1'), w('out1', 'u2')];
    await themed(<Favorites />);
    expect(await screen.findByText('meaning in1')).toBeOnTheScreen();
    expect(screen.queryByText('meaning out1')).toBeNull();
  });
});

describe('Speaking', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Speaking = require('../../../app/speaking-practice').default;

  it('drills only words in the scope', async () => {
    mockWeakest = [w('out1', 'u2'), w('in1', 'u1')];
    await themed(<Speaking />);
    expect(await screen.findByText('Speaking: in1')).toBeOnTheScreen();
  });

  it('guest: at most 2 words', async () => {
    mockTier = 'guest';
    mockScopeState = { ...mockScopeState, scope: buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }) };
    mockWeakest = [w('a', 'u1'), w('b', 'u1'), w('c', 'u1')];
    await themed(<Speaking />);
    expect(await screen.findByText('1/2')).toBeOnTheScreen();
  });
});

describe('Listening', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Listening = require('../../../app/listening-practice').default;

  it('is not offered to guests: the create-account explanation instead', async () => {
    mockTier = 'guest';
    await themed(<Listening />);
    expect(await screen.findByText('Create a free account to keep learning')).toBeOnTheScreen();
  });
});
