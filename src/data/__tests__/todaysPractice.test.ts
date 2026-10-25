// Where Today's Practice gets its content, and the access rules applied
// while loading it (not just in the UI).
const mockFetchReviewQueue = jest.fn();
const mockFetchLessonMap = jest.fn();
const mockFetchAccessibleLessonWordGroups = jest.fn();
const mockFetchSeen = jest.fn();
const mockLoadRam = jest.fn();
const mockGetRamProgress = jest.fn();
const mockHasUsedFreeReview = jest.fn();

jest.mock('@/data/progress', () => ({
  fetchReviewQueue: (...a: unknown[]) => mockFetchReviewQueue(...a),
  fetchSeenWordGroupIds: (...a: unknown[]) => mockFetchSeen(...a),
}));
jest.mock('@/data/content', () => ({ fetchLessonMap: (...a: unknown[]) => mockFetchLessonMap(...a) }));
jest.mock('@/data/premiumAccess', () => ({
  fetchAccessibleLessonWordGroups: (...a: unknown[]) => mockFetchAccessibleLessonWordGroups(...a),
}));
jest.mock('@/data/repeatAfterMe', () => ({ loadRepeatAfterMeSession: (...a: unknown[]) => mockLoadRam(...a) }));
jest.mock('@/lib/repeatAfterMe/progress', () => ({ getRepeatAfterMeProgress: (...a: unknown[]) => mockGetRamProgress(...a) }));
jest.mock('@/lib/premium/freeAllowance', () => ({ hasUsedFreeReviewToday: (...a: unknown[]) => mockHasUsedFreeReview(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadTodaysPractice } = require('@/data/todaysPractice');

const group = (id: string) => ({ id, englishMeaning: id, variants: [{ id: `${id}-v`, variantLabel: 'primary', wordArabic: 'x', transliteration: id }] });
const lesson = (id: string, state: string, sortOrder: number) => ({ id, unitId: 'u1', sortOrder, lessonNumber: sortOrder, state, title: null });
const unitMap = (lessons: ReturnType<typeof lesson>[]) => [
  { unit: { id: 'u1', sortOrder: 1, isCurriculum: true, name: 'Basics' }, lessons },
];

const ids = (plan: { steps: { kind: string; group?: { id: string }; item?: { id: string } }[] }) =>
  plan.steps.map((s) => (s.kind === 'word' ? s.group!.id : s.item!.id));

beforeEach(() => {
  mockFetchReviewQueue.mockReset().mockResolvedValue([group('due1')]);
  mockFetchLessonMap.mockReset().mockResolvedValue(unitMap([lesson('l1', 'completed', 1), lesson('l2', 'unlocked', 2)]));
  mockFetchAccessibleLessonWordGroups.mockReset().mockResolvedValue([group('a'), group('b'), group('c')]);
  mockFetchSeen.mockReset().mockResolvedValue(new Set(['a']));
  mockGetRamProgress.mockReset().mockResolvedValue({ items: {}, sessionsCompleted: 0, lastCompletedAt: null });
  mockLoadRam.mockReset().mockResolvedValue({ items: [{ id: 'ram1', wordGroupId: 'rg1', englishMeaning: 'x', variant: {} }], lockedCount: 0 });
  mockHasUsedFreeReview.mockReset().mockResolvedValue(false);
});

it('Premium: due review, unseen words from the current lesson, and Repeat After Me', async () => {
  const plan = await loadTodaysPractice({ profileId: 'p1', isPremium: true, track: 'adult' });

  expect(ids(plan)).toEqual(['due1', 'b', 'c', 'ram1']);
  expect(mockFetchAccessibleLessonWordGroups).toHaveBeenCalledWith('l2', true);
  expect(mockFetchSeen).toHaveBeenCalledWith('p1', ['a', 'b', 'c']);
  expect(mockLoadRam).toHaveBeenCalledWith({ isPremium: true, progress: {} });
  expect(mockHasUsedFreeReview).not.toHaveBeenCalled();
});

it('free who already used today’s review: the review queue is not even fetched', async () => {
  mockHasUsedFreeReview.mockResolvedValue(true);

  const plan = await loadTodaysPractice({ profileId: 'p1', isPremium: false, track: 'adult' });

  expect(mockFetchReviewQueue).not.toHaveBeenCalled();
  expect(ids(plan)).not.toContain('due1');
  expect(plan.usesFreeReview).toBe(false);
});

it('free: new words only come from a lesson the free plan includes', async () => {
  // l2 is the current lesson but only the first lesson is free.
  const plan = await loadTodaysPractice({ profileId: 'p1', isPremium: false, track: 'adult' });

  expect(mockFetchAccessibleLessonWordGroups).not.toHaveBeenCalled();
  expect(ids(plan)).toEqual(['due1', 'ram1']);
  expect(mockLoadRam).toHaveBeenCalledWith(expect.objectContaining({ isPremium: false }));
});

it('free on the first lesson: gets its unseen words', async () => {
  mockFetchLessonMap.mockResolvedValue(unitMap([lesson('l1', 'unlocked', 1), lesson('l2', 'locked', 2)]));

  const plan = await loadTodaysPractice({ profileId: 'p1', isPremium: false, track: 'adult' });

  expect(mockFetchAccessibleLessonWordGroups).toHaveBeenCalledWith('l1', false);
  expect(ids(plan)).toEqual(['due1', 'b', 'c', 'ram1']);
});

it('every lesson finished: no new words (nothing is invented)', async () => {
  mockFetchLessonMap.mockResolvedValue(unitMap([lesson('l1', 'completed', 1)]));

  const plan = await loadTodaysPractice({ profileId: 'p1', isPremium: true, track: 'adult' });

  expect(mockFetchAccessibleLessonWordGroups).not.toHaveBeenCalled();
  expect(ids(plan)).toEqual(['due1', 'ram1']);
});

it('one source failing still gives a session from the others', async () => {
  mockLoadRam.mockRejectedValue(new Error('column "in_repeat_after_me" does not exist'));

  const plan = await loadTodaysPractice({ profileId: 'p1', isPremium: true, track: 'adult' });

  expect(ids(plan)).toEqual(['due1', 'b', 'c']);
});

it('every source failing is an error (shown with retry), not a silently empty session', async () => {
  mockFetchReviewQueue.mockRejectedValue(new Error('offline'));
  mockFetchLessonMap.mockRejectedValue(new Error('offline'));
  mockLoadRam.mockRejectedValue(new Error('offline'));

  await expect(loadTodaysPractice({ profileId: 'p1', isPremium: true, track: 'adult' })).rejects.toThrow();
});
