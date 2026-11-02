// Practice (Review, Flashcards, Listening, Speaking, Favorites, Today's
// Practice) isn't counted — it only uses approved words from lessons /
// phrasebook categories the learner has open (Premium: every approved word).
import { renderHook, waitFor } from '@testing-library/react-native';

import { buildPracticeScope, filterToPracticeScope, inPracticeScope } from '@/lib/access/practiceScope';

const word = (id: string, unitId: string, lessonNumber: number, contentStatus = 'approved') => ({
  id,
  unitId,
  lessonNumber,
  contentStatus,
});

describe('practice scope (pure)', () => {
  const scope = buildPracticeScope({
    all: false,
    openLessons: [{ unitId: 'u1', lessonNumber: 1 }],
    openUnitIds: ['pb-greetings'],
  });

  it('words from an open lesson or open phrasebook category are in', () => {
    expect(inPracticeScope(scope, word('a', 'u1', 1))).toBe(true);
    expect(inPracticeScope(scope, word('b', 'pb-greetings', 1))).toBe(true);
  });

  it('words from other lessons / categories are out', () => {
    expect(inPracticeScope(scope, word('c', 'u1', 2))).toBe(false);
    expect(inPracticeScope(scope, word('d', 'u2', 1))).toBe(false);
    expect(inPracticeScope(scope, word('e', 'pb-food', 1))).toBe(false);
  });

  it('never a draft word, even with Premium', () => {
    expect(inPracticeScope(scope, word('f', 'u1', 1, 'draft'))).toBe(false);
    const all = buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] });
    expect(inPracticeScope(all, word('g', 'u9', 9))).toBe(true);
    expect(inPracticeScope(all, word('h', 'u9', 9, 'draft'))).toBe(false);
  });

  it('filter keeps order', () => {
    expect(filterToPracticeScope(scope, [word('c', 'u1', 2), word('b', 'pb-greetings', 1), word('a', 'u1', 1)]).map((w) => w.id)).toEqual([
      'b',
      'a',
    ]);
  });
});

describe('usePracticeScope', () => {
  let mockTier: 'guest' | 'free' | 'premium' = 'free';
  let mockClaims: Record<string, string[]> = {};
  const mockLessonMap = jest.fn();
  const mockCategories = jest.fn();
  jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => ({ activeProfile: { id: 'p1' } }) }));
  jest.mock('@/data/content', () => ({
    fetchLessonMap: (...a: unknown[]) => mockLessonMap(...a),
    fetchPhrasebookCategories: (...a: unknown[]) => mockCategories(...a),
  }));
  const mockDecide = (feature: string, key: string, opts?: { completed?: boolean }) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/lib/access/accessRules').decideItemAccess({
      tier: mockTier,
      claimed: new Set(mockClaims[feature] ?? []),
      itemKey: key,
      completed: opts?.completed,
    });
  jest.mock('@/lib/access/AccessContext', () => ({
    useAccess: () => ({ tier: mockTier, isResolved: true, decide: mockDecide }),
  }));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { usePracticeScope } = require('@/lib/access/usePracticeScope');

  beforeEach(() => {
    mockTier = 'free';
    mockClaims = {};
    mockLessonMap.mockReset().mockResolvedValue([
      {
        unit: { id: 'u1' },
        lessons: [
          { id: 'l1', unitId: 'u1', lessonNumber: 1, state: 'completed' },
          { id: 'l2', unitId: 'u1', lessonNumber: 2, state: 'unlocked' },
          { id: 'l3', unitId: 'u1', lessonNumber: 3, state: 'locked' },
        ],
      },
    ]);
    mockCategories.mockReset().mockResolvedValue([
      { unitId: 'pb-greetings', lessonId: 'pl-1' },
      { unitId: 'pb-food', lessonId: 'pl-2' },
    ]);
  });

  it('free: opened + completed lessons and opened categories', async () => {
    mockClaims = { lesson: ['l2'], phrasebook_category: ['pb-food'] };
    const { result } = await renderHook(() => usePracticeScope());
    await waitFor(() => expect(result.current.scope).not.toBeNull());
    const s = result.current.scope;
    expect(inPracticeScope(s, word('a', 'u1', 1))).toBe(true); // completed
    expect(inPracticeScope(s, word('b', 'u1', 2))).toBe(true); // opened
    expect(inPracticeScope(s, word('c', 'u1', 3))).toBe(false);
    expect(inPracticeScope(s, word('d', 'pb-food', 1))).toBe(true);
    expect(inPracticeScope(s, word('e', 'pb-greetings', 1))).toBe(false);
  });

  it('Premium: everything approved, without loading the lesson map', async () => {
    mockTier = 'premium';
    const { result } = await renderHook(() => usePracticeScope());
    await waitFor(() => expect(result.current.scope).not.toBeNull());
    expect(result.current.scope.all).toBe(true);
    expect(mockLessonMap).not.toHaveBeenCalled();
  });

  it('if the lessons can’t be loaded: an error, never an open scope', async () => {
    mockLessonMap.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => usePracticeScope());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.scope).toBeNull();
  });
});
