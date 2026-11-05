// The search index lives in memory only, keyed by who is searching and what
// they can open. It's reused while that stays the same, rebuilt when it
// changes (sign-in, Premium refresh, admin preview toggle, carry-over, newly
// opened lessons), cleared on sign-out, and never written to disk.
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { buildPracticeScope } from '@/lib/access/practiceScope';

const mockLoad = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'acc-1' } };
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockScopeState: { scope: unknown; error: boolean; reload: () => void } = {
  scope: buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] }),
  error: false,
  reload: jest.fn(),
};
const mockSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: (...a: unknown[]) => mockSetItem(...a) },
}));
jest.mock('@/data/search', () => ({ fetchSearchableWordGroups: (...a: unknown[]) => mockLoad(...a) }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: mockTier, isResolved: true }) }));
jest.mock('@/lib/access/usePracticeScope', () => ({ usePracticeScope: () => mockScopeState }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useSearchIndex } = require('@/lib/search/useSearchIndex');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { clearSearchIndex, hasCachedSearchIndex } = require('@/lib/search/searchIndexCache');

const WORD = { id: 'w1', englishMeaning: 'hello', unitId: 'u1', lessonNumber: 1, contentStatus: 'approved', variants: [] };

beforeEach(() => {
  clearSearchIndex();
  mockLoad.mockReset().mockResolvedValue([WORD]);
  mockSession = { user: { id: 'acc-1' } };
  mockTier = 'free';
  mockScopeState = {
    scope: buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] }),
    error: false,
    reload: jest.fn(),
  };
  mockSetItem.mockClear();
});

it('loads with the learner’s scope and builds the index in memory (nothing on disk)', async () => {
  const { result } = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(mockLoad).toHaveBeenCalledWith(mockScopeState.scope);
  expect(result.current.index.entries).toHaveLength(1);
  expect(mockSetItem).not.toHaveBeenCalled();
});

it('reuses the index while nothing changed', async () => {
  const first = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(first.result.current.status).toBe('ready'));
  const second = await renderHook(() => useSearchIndex());
  expect(second.result.current.status).toBe('ready');
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

it('rebuilds when access changes: Premium refresh / admin preview toggle (tier), newly opened lessons (scope)', async () => {
  const hook = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));

  mockTier = 'premium';
  mockScopeState = { ...mockScopeState, scope: buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }) };
  await hook.rerender(undefined);
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));

  mockTier = 'free';
  mockScopeState = {
    ...mockScopeState,
    scope: buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 2 }], openUnitIds: [] }),
  };
  await hook.rerender(undefined);
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(3));
});

it('a different account (sign-in after guest carry-over) never reuses the old index', async () => {
  mockSession = null;
  mockTier = 'guest';
  const hook = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  mockSession = { user: { id: 'acc-2' } };
  mockTier = 'free';
  await hook.rerender(undefined);
  await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
});

it('clearSearchIndex (on sign-out) drops it from memory', async () => {
  const { result } = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(hasCachedSearchIndex()).toBe(true);
  clearSearchIndex();
  expect(hasCachedSearchIndex()).toBe(false);
});

it('no connection and no index in memory: "offline", with a retry', async () => {
  mockLoad.mockRejectedValueOnce(new Error('network'));
  const { result } = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(result.current.status).toBe('offline'));
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe('ready'));
});

it('if the access scope can’t load, it never falls back to an open index', async () => {
  mockScopeState = { scope: null, error: true, reload: jest.fn() };
  const { result } = await renderHook(() => useSearchIndex());
  await waitFor(() => expect(result.current.status).toBe('offline'));
  expect(mockLoad).not.toHaveBeenCalled();
});
