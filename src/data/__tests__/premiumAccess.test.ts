// Direct navigation to locked content: /lesson/[lessonId], /words/[lessonId]
// and /phrasebook/[categoryId] all load through fetchAccessibleLessonWordGroups,
// so these cover what a deep link to a locked lesson actually gets — and,
// critically, that its content is never fetched.

const mockFetchWordGroupsForLesson = jest.fn();
const mockTables: Record<string, unknown[]> = {};

jest.mock('@/data/content', () => ({
  fetchWordGroupsForLesson: (...args: unknown[]) => mockFetchWordGroupsForLesson(...args),
}));

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: async () => ({ data: mockTables[table] ?? [], error: null }),
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchAccessibleLessonWordGroups, canAccessPhrasebookCategory } = require('@/data/premiumAccess');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PremiumRequiredError } = require('@/lib/premium/access');

beforeEach(() => {
  mockFetchWordGroupsForLesson.mockReset().mockResolvedValue([{ id: 'wg1' }]);
  mockTables.units = [
    { id: 'u1', sort_order: 1, is_curriculum: true },
    { id: 'pb-greetings', sort_order: 100, is_curriculum: false },
    { id: 'pb-hotel', sort_order: 105, is_curriculum: false },
  ];
  mockTables.lessons = [
    { id: 'lesson-1', unit_id: 'u1', sort_order: 1 },
    { id: 'lesson-2', unit_id: 'u1', sort_order: 2 },
    { id: 'greetings-lesson', unit_id: 'pb-greetings', sort_order: 1 },
    { id: 'hotel-lesson', unit_id: 'pb-hotel', sort_order: 1 },
  ];
});

describe('fetchAccessibleLessonWordGroups', () => {
  it.each(['lesson-2', 'hotel-lesson'])(
    'free profile opening locked %s directly: rejects with PremiumRequiredError and never fetches its content',
    async (lessonId) => {
      await expect(fetchAccessibleLessonWordGroups(lessonId, false)).rejects.toBeInstanceOf(PremiumRequiredError);
      expect(mockFetchWordGroupsForLesson).not.toHaveBeenCalled();
    }
  );

  it.each(['lesson-1', 'greetings-lesson'])('free profile can load free %s', async (lessonId) => {
    await expect(fetchAccessibleLessonWordGroups(lessonId, false)).resolves.toEqual([{ id: 'wg1' }]);
    expect(mockFetchWordGroupsForLesson).toHaveBeenCalledWith(lessonId);
  });

  it('Premium loads any lesson without an access lookup changing behavior', async () => {
    await expect(fetchAccessibleLessonWordGroups('lesson-2', true)).resolves.toEqual([{ id: 'wg1' }]);
    expect(mockFetchWordGroupsForLesson).toHaveBeenCalledWith('lesson-2');
  });
});

describe('canAccessPhrasebookCategory (direct link to /phrasebook/[categoryId])', () => {
  const categories = [
    { unitId: 'pb-hotel', lessonId: 'hotel-lesson', name: 'Hotel', sortOrder: 105, phraseCount: 5 },
    { unitId: 'pb-greetings', lessonId: 'greetings-lesson', name: 'Greetings', sortOrder: 100, phraseCount: 6 },
  ];

  it('free: Greetings only', () => {
    expect(canAccessPhrasebookCategory(false, 'pb-greetings', categories)).toBe(true);
    expect(canAccessPhrasebookCategory(false, 'pb-hotel', categories)).toBe(false);
  });

  it('Premium: every category', () => {
    expect(canAccessPhrasebookCategory(true, 'pb-hotel', categories)).toBe(true);
  });
});
