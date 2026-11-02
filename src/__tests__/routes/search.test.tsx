// Dictionary / Search screen, end to end with the real index (only the
// access-filtered loader is faked):
// - results grouped by word; the "matched" note only for non-primary forms;
// - typing never touches the network, logs nothing, and never counts;
// - the empty state is the same static text whatever was typed (so it can't
//   reveal that a locked word exists), with "Ask for this word";
// - guests: opening a result counts (2), the next one gets the
//   create-account prompt; free / Premium open freely;
// - no connection and no index: "Search needs a connection".
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
const mockOpen = jest.fn(async () => true);
const mockLoad = jest.fn();
const mockSupabase = { from: jest.fn(), rpc: jest.fn(), functions: { invoke: jest.fn() } };
const mockScopeState = {
  scope: { all: false, lessonKeys: new Set(['u1#1']), unitIds: new Set() },
  error: false,
  reload: jest.fn(),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: mockSupabase, getAudioUrl: () => null, getImageUrl: () => null }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: mockTier === 'guest' ? null : { user: { id: 'acc-1' } } }) }));
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({ tier: mockTier, isResolved: true, open: mockOpen }),
}));
jest.mock('@/lib/access/usePracticeScope', () => ({ usePracticeScope: () => mockScopeState }));
jest.mock('@/data/search', () => ({ fetchSearchableWordGroups: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('@/lib/display/useDisplayPreferences', () => ({
  useDisplayPreferences: () => ({ preferences: { script: 'latin', form: 'both' } }),
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, retry: jest.fn() }),
}));

const variant = (id: string, label: string, transliteration: string, native = false) => ({
  id,
  wordGroupId: '',
  variantLabel: label,
  wordArabic: 'كلمة',
  transliteration,
  audioPath: native ? `${id}.m4a` : null,
  contentStatus: 'approved',
  nativeVerified: native,
  isNativeVoice: native,
  sortOrder: 0,
});
const WORDS = [
  { id: 'tired', englishMeaning: 'tired', unitId: 'u1', lessonNumber: 1, contentStatus: 'approved', variants: [
    variant('t1', 'primary', 'ta3ban', true),
    variant('t2', 'also_heard', 'mfadda'),
    variant('t3', 'masculine', 'ta3ben'),
    variant('t4', 'feminine', 'ta3bena'),
  ] },
  { id: 'bread', englishMeaning: 'bread', unitId: 'u1', lessonNumber: 1, contentStatus: 'approved', variants: [variant('b1', 'primary', '5obz')] },
  { id: 'eye', englishMeaning: 'eye', unitId: 'u1', lessonNumber: 1, contentStatus: 'approved', variants: [variant('e1', 'primary', '3in')] },
];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SearchScreen = require('../../../app/search').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { clearSearchIndex } = require('@/lib/search/searchIndexCache');

const renderSearch = () => render(<ThemeProvider><SearchScreen /></ThemeProvider>);
const type = async (text: string) => fireEvent.changeText(await screen.findByLabelText('Search words'), text);

beforeEach(() => {
  clearSearchIndex();
  mockPush.mockReset();
  mockTier = 'free';
  mockOpen.mockReset().mockResolvedValue(true);
  mockLoad.mockReset().mockResolvedValue(WORDS);
  mockSupabase.from.mockReset();
  mockSupabase.rpc.mockReset();
  mockSupabase.functions.invoke.mockReset();
});

it('loads the searchable words once, with the learner’s scope', async () => {
  await renderSearch();
  await type('ta3');
  await screen.findByText('tired');
  expect(mockLoad).toHaveBeenCalledTimes(1);
  expect(mockLoad).toHaveBeenCalledWith(mockScopeState.scope);
});

it('one row per word, showing the primary form and the meaning', async () => {
  await renderSearch();
  await type('ta3b');
  expect(await screen.findAllByRole('button', { name: /^ta3ban — tired/ })).toHaveLength(1);
});

it('a "matched" note only when a non-primary form matched', async () => {
  await renderSearch();
  await type('mfadda');
  expect(await screen.findByText('matched: also heard')).toBeOnTheScreen();
  await type('ta3ban');
  await waitFor(() => expect(screen.queryByText(/matched:/)).toBeNull());
  expect(screen.getByRole('button', { name: /^ta3ban — tired/ })).toBeOnTheScreen();
  await type('ta3bena');
  expect(await screen.findByText('matched: feminine')).toBeOnTheScreen();
});

it('a speaker button only for a native recording', async () => {
  await renderSearch();
  await type('ta3ban');
  expect(await screen.findByRole('button', { name: 'Hear tired' })).toBeOnTheScreen();
  await type('5obz');
  await screen.findByRole('button', { name: /^5obz — bread/ });
  expect(screen.queryByRole('button', { name: 'Hear bread' })).toBeNull();
});

it('typing never touches the network or counts anything', async () => {
  await renderSearch();
  for (const q of ['t', 'ta', 'ta3', '5obz', 'zzz']) await type(q);
  await screen.findByText(/No matching words/);
  expect(mockSupabase.from).not.toHaveBeenCalled();
  expect(mockSupabase.rpc).not.toHaveBeenCalled();
  expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

it('the empty state is identical whatever was typed — it can’t hint at a locked word', async () => {
  await renderSearch();
  const emptyText = async (q: string) => {
    await type(q);
    await screen.findByText(/No matching words/);
    return screen.getAllByText(/.+/).map((el) => [el.props.children].flat(Infinity).join('')).filter((t) => !t.includes(q)).join(' | ');
  };
  // "9alb" is a word in a locked lesson (never loaded); "qqqq" matches nothing anywhere.
  expect(await emptyText('9alb')).toBe(await emptyText('qqqq'));
  expect(screen.getByText('More words are included with Premium.')).toBeOnTheScreen();
});

it('"Ask for this word" opens a translation request prefilled with the search (not sent)', async () => {
  await renderSearch();
  await type('kosksi');
  await fireEvent.press(await screen.findByRole('button', { name: 'Ask for this word' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/translation-requests', params: { text: 'kosksi' } });
  expect(mockSupabase.from).not.toHaveBeenCalled();
});

it('free: opening a result goes to Word detail', async () => {
  await renderSearch();
  await type('5obz');
  await fireEvent.press(await screen.findByRole('button', { name: /^5obz — bread/ }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/word/bread'));
});

describe('guest', () => {
  beforeEach(() => {
    mockTier = 'guest';
  });

  it('opening a result counts it (on the device); past 2, the create-account prompt', async () => {
    await renderSearch();
    await type('5obz');
    await fireEvent.press(await screen.findByRole('button', { name: /^5obz — bread/ }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/word/bread'));
    expect(mockOpen).toHaveBeenCalledWith('dictionary_result', 'bread');

    mockPush.mockReset();
    mockOpen.mockResolvedValue(false);
    await type('3in');
    await fireEvent.press(await screen.findByRole('button', { name: /^3in — eye/ }));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } })
    );
    expect(mockPush).not.toHaveBeenCalledWith('/word/eye');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('empty state: a free account instead of a translation request', async () => {
    await renderSearch();
    await type('kosksi');
    await fireEvent.press(await screen.findByRole('button', { name: 'Ask for this word' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'account' } });
    expect(screen.getByText('Create a free account to search more words.')).toBeOnTheScreen();
  });
});

it('Premium: no upgrade line', async () => {
  mockTier = 'premium';
  await renderSearch();
  await type('qqqq');
  await screen.findByText(/No matching words/);
  expect(screen.queryByText(/Premium/)).toBeNull();
});

it('no connection and no index: "Search needs a connection", then retry', async () => {
  mockLoad.mockRejectedValueOnce(new Error('network'));
  await renderSearch();
  expect(await screen.findByText('Search needs a connection')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await type('5obz');
  expect(await screen.findByRole('button', { name: /^5obz — bread/ })).toBeOnTheScreen();
});
