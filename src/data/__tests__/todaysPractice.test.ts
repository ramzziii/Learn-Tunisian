// Where Today's Practice gets its content, and the access rules applied
// while loading it (not just in the UI). Practice isn't counted: words only
// from the practice scope (open lessons / categories, approved); new words
// from the current lesson — which, if it isn't open yet, is opened first
// (counted, like starting the lesson) only when the allowance has room; and
// Repeat After Me only recordings already opened (all with Premium).
import { buildPracticeScope } from '@/lib/access/practiceScope';

const mockFetchReviewQueue = jest.fn();
const mockFetchLessonMap = jest.fn();
const mockFetchWordGroupsForLesson = jest.fn();
const mockFetchSeen = jest.fn();
const mockLoadRam = jest.fn();
const mockGetRamProgress = jest.fn();

jest.mock('@/data/progress', () => ({
  fetchReviewQueue: (...a: unknown[]) => mockFetchReviewQueue(...a),
  fetchSeenWordGroupIds: (...a: unknown[]) => mockFetchSeen(...a),
}));
jest.mock('@/data/content', () => ({
  fetchLessonMap: (...a: unknown[]) => mockFetchLessonMap(...a),
  fetchWordGroupsForLesson: (...a: unknown[]) => mockFetchWordGroupsForLesson(...a),
}));
jest.mock('@/data/repeatAfterMe', () => ({ loadRepeatAfterMeSession: (...a: unknown[]) => mockLoadRam(...a) }));
jest.mock('@/lib/repeatAfterMe/progress', () => ({ getRepeatAfterMeProgress: (...a: unknown[]) => mockGetRamProgress(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadTodaysPractice } = require('@/data/todaysPractice');

const group = (id: string, lessonNumber = 2, unitId = 'u1') => ({
  id,
  unitId,
  lessonNumber,
  contentStatus: 'approved',
  englishMeaning: id,
  variants: [{ id: `${id}-v`, variantLabel: 'primary', wordArabic: 'x', transliteration: id }],
});
const lesson = (id: string, state: string, n: number) => ({ id, unitId: 'u1', sortOrder: n, lessonNumber: n, state, title: null });
const unitMap = (lessons: ReturnType<typeof lesson>[]) => [
  { unit: { id: 'u1', sortOrder: 1, isCurriculum: true, name: 'Basics' }, lessons },
];
const ALL = buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] });
const ONLY_L1 = buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] });

const ids = (plan: { steps: { kind: string; group?: { id: string }; item?: { id: string } }[] }) =>
  plan.steps.map((s) => (s.kind === 'word' ? s.group!.id : s.item!.id));

beforeEach(() => {
  mockFetchReviewQueue.mockReset().mockResolvedValue([group('due1', 1)]);
  mockFetchLessonMap.mockReset().mockResolvedValue(unitMap([lesson('l1', 'completed', 1), lesson('l2', 'unlocked', 2)]));
  mockFetchWordGroupsForLesson.mockReset().mockResolvedValue([group('a'), group('b'), group('c')]);
  mockFetchSeen.mockReset().mockResolvedValue(new Set(['a']));
  mockGetRamProgress.mockReset().mockResolvedValue({ items: {}, sessionsCompleted: 0, lastCompletedAt: null });
  mockLoadRam.mockReset().mockResolvedValue({ items: [{ id: 'ram1', wordGroupId: 'rg1', englishMeaning: 'x', variant: {} }], lockedCount: 0 });
});

it('Premium: due review, unseen words from the current lesson, and Repeat After Me', async () => {
  const plan = await loadTodaysPractice({ profileId: 'p1', scope: ALL, ramUnlimited: true, ramOpenIds: new Set() });

  expect(ids(plan)).toEqual(['due1', 'b', 'c', 'ram1']);
  expect(mockFetchWordGroupsForLesson).toHaveBeenCalledWith('l2');
  expect(mockFetchSeen).toHaveBeenCalledWith('p1', ['a', 'b', 'c']);
  expect(mockLoadRam).toHaveBeenCalledWith({ unlimited: true, openIds: new Set(), remaining: 0, progress: {} });
});

it('review words only from the scope (no daily allowance any more)', async () => {
  mockFetchReviewQueue.mockResolvedValue([group('due1', 1), group('dueOut', 3)]);
  const plan = await loadTodaysPractice({ profileId: 'p1', scope: ONLY_L1, ramUnlimited: false, ramOpenIds: new Set() });
  expect(ids(plan)).toContain('due1');
  expect(ids(plan)).not.toContain('dueOut');
});

it('current lesson not open yet, allowance left: it is opened (counted) and its new words are used', async () => {
  const openLesson = jest.fn(async () => true);
  const plan = await loadTodaysPractice({ profileId: 'p1', scope: ONLY_L1, ramUnlimited: false, ramOpenIds: new Set(), openLesson });
  expect(openLesson).toHaveBeenCalledWith('l2');
  expect(ids(plan)).toEqual(['due1', 'b', 'c', 'ram1']);
});

it('current lesson not open and the allowance is used up: no new words, nothing fetched', async () => {
  const openLesson = jest.fn(async () => false);
  const plan = await loadTodaysPractice({ profileId: 'p1', scope: ONLY_L1, ramUnlimited: false, ramOpenIds: new Set(), openLesson });
  expect(mockFetchWordGroupsForLesson).not.toHaveBeenCalled();
  expect(ids(plan)).not.toContain('b');
});

it('an already-open current lesson is never opened again', async () => {
  const openLesson = jest.fn(async () => true);
  await loadTodaysPractice({ profileId: 'p1', scope: ALL, ramUnlimited: true, ramOpenIds: new Set(), openLesson });
  expect(openLesson).not.toHaveBeenCalled();
});

it('Repeat After Me: only recordings already opened, nothing new counted', async () => {
  await loadTodaysPractice({ profileId: 'p1', scope: ONLY_L1, ramUnlimited: false, ramOpenIds: new Set(['ram1']) });
  expect(mockLoadRam).toHaveBeenCalledWith({ unlimited: false, openIds: new Set(['ram1']), remaining: 0, progress: {} });
});

it('every lesson finished: no new words (nothing is invented)', async () => {
  mockFetchLessonMap.mockResolvedValue(unitMap([lesson('l1', 'completed', 1)]));
  const plan = await loadTodaysPractice({ profileId: 'p1', scope: ALL, ramUnlimited: true, ramOpenIds: new Set() });
  expect(mockFetchWordGroupsForLesson).not.toHaveBeenCalled();
  expect(ids(plan)).toEqual(['due1', 'ram1']);
});

it('one source failing still gives a session from the others', async () => {
  mockLoadRam.mockRejectedValue(new Error('column "in_repeat_after_me" does not exist'));
  const plan = await loadTodaysPractice({ profileId: 'p1', scope: ALL, ramUnlimited: true, ramOpenIds: new Set() });
  expect(ids(plan)).toEqual(['due1', 'b', 'c']);
});

it('every source failing is an error (shown with retry), not a silently empty session', async () => {
  mockFetchReviewQueue.mockRejectedValue(new Error('offline'));
  mockFetchLessonMap.mockRejectedValue(new Error('offline'));
  mockLoadRam.mockRejectedValue(new Error('offline'));
  await expect(
    loadTodaysPractice({ profileId: 'p1', scope: ALL, ramUnlimited: true, ramOpenIds: new Set() })
  ).rejects.toThrow();
});
