// What opening /lesson/[id] (or /words/[id]) counts as: a curriculum lesson
// (with whether it's completed), or the phrasebook category it backs. Unknown
// lessons (or ones outside the guest preview) resolve to null.
const mockLessonMap = jest.fn();
const mockCategories = jest.fn();
jest.mock('@/data/content', () => ({
  fetchLessonMap: (...a: unknown[]) => mockLessonMap(...a),
  fetchPhrasebookCategories: (...a: unknown[]) => mockCategories(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchLessonAccessTarget } = require('@/data/lessonAccess');

beforeEach(() => {
  mockLessonMap.mockResolvedValue([
    { unit: { id: 'u1' }, lessons: [{ id: 'l1', state: 'completed' }, { id: 'l2', state: 'unlocked' }] },
  ]);
  mockCategories.mockResolvedValue([{ unitId: 'pb-greetings', lessonId: 'pb-l1', name: 'Greetings' }]);
});

it('curriculum lesson: counted as a lesson, with its completion', async () => {
  await expect(fetchLessonAccessTarget('p1', 'l1')).resolves.toEqual({ feature: 'lesson', key: 'l1', completed: true });
  await expect(fetchLessonAccessTarget('p1', 'l2')).resolves.toEqual({ feature: 'lesson', key: 'l2', completed: false });
  expect(mockLessonMap).toHaveBeenCalledWith('p1');
});

it('phrasebook lesson: counted as its category', async () => {
  await expect(fetchLessonAccessTarget('p1', 'pb-l1')).resolves.toEqual({
    feature: 'phrasebook_category',
    key: 'pb-greetings',
    completed: false,
  });
});

it('unknown lesson: null', async () => {
  await expect(fetchLessonAccessTarget('p1', 'nope')).resolves.toBeNull();
});
