// What Dictionary / Search loads. Locked words are never fetched — the
// queries only ever ask for what this learner can open:
// - guest: the guest-preview views only (never the full tables);
// - free: only the open lessons (unit + lesson number) and open phrasebook
//   categories, approved only;
// - Premium: every approved word, in pages.
import { buildPracticeScope } from '@/lib/access/practiceScope';
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
let mockGuest = false;
jest.mock('@/lib/guest/guestSession', () => ({ isGuestSessionActive: () => mockGuest }));
const mockGuestWords = jest.fn();
jest.mock('@/data/guest/guestContent', () => ({ fetchGuestWordGroups: (...a: unknown[]) => mockGuestWords(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchSearchableWordGroups, SEARCH_PAGE_SIZE } = require('@/data/search');

const groupRow = (id: string, unitId: string, lessonNumber: number, status = 'approved') => ({
  id,
  unit_id: unitId,
  lesson_number: lessonNumber,
  english_meaning: `meaning ${id}`,
  image_keyword: null,
  image_path: null,
  sort_order: 0,
  content_status: status,
  created_by: null,
  updated_by: null,
  created_at: 'x',
  updated_at: 'x',
});
const variantRow = (id: string, groupId: string, status = 'approved') => ({
  id,
  word_group_id: groupId,
  variant_label: 'primary',
  word_arabic: 'كلمة',
  transliteration: id,
  audio_path: null,
  notes: null,
  sort_order: 0,
  native_verified: false,
  content_status: status,
  created_by: null,
  updated_by: null,
  created_at: 'x',
  updated_at: 'x',
  speaker_name: null,
  dialect_notes: null,
  is_native_voice: false,
});

const selects = (table: string) => mockDb.queries.filter((q) => q.table === table && q.operation === 'select');
const approvedOnly = (table: string) =>
  selects(table).every((q) => q.calls.some((c) => c[0] === 'eq' && c[1] === 'content_status' && c[2] === 'approved'));

beforeEach(() => {
  mockDb.reset();
  mockGuest = false;
  mockGuestWords.mockReset();
});

it('guest: the preview views only — the full tables are never asked', async () => {
  mockGuest = true;
  mockGuestWords.mockResolvedValue([{ id: 'g1', contentStatus: 'approved', variants: [] }]);
  const words = await fetchSearchableWordGroups(buildPracticeScope({ all: false, openLessons: [], openUnitIds: [] }));
  expect(words.map((w: { id: string }) => w.id)).toEqual(['g1']);
  expect(mockGuestWords).toHaveBeenCalledWith();
  expect(mockDb.queries).toEqual([]);
});

it('free: asks only for the open lessons and categories, approved only', async () => {
  mockDb.respond('word_groups.select', { data: [groupRow('a', 'u1', 1), groupRow('b', 'pb-food', 1)], error: null });
  mockDb.respond('word_variants.select', { data: [variantRow('va', 'a'), variantRow('vb', 'b')], error: null });
  const scope = buildPracticeScope({
    all: false,
    openLessons: [
      { unitId: 'u1', lessonNumber: 1 },
      { unitId: 'u1', lessonNumber: 2 },
    ],
    openUnitIds: ['pb-food'],
  });
  const words = await fetchSearchableWordGroups(scope);

  const groupQuery = selects('word_groups')[0];
  const orFilter = groupQuery.calls.find((c) => c[0] === 'or');
  expect(orFilter?.[1]).toBe(
    'and(unit_id.eq.u1,lesson_number.eq.1),and(unit_id.eq.u1,lesson_number.eq.2),unit_id.in.(pb-food)'
  );
  expect(approvedOnly('word_groups')).toBe(true);
  expect(approvedOnly('word_variants')).toBe(true);
  // Forms are asked only for the words just loaded.
  expect(selects('word_variants')[0].calls).toContainEqual(['in', 'word_group_id', ['a', 'b']]);
  expect(words.map((w: { id: string; variants: unknown[] }) => [w.id, w.variants.length])).toEqual([
    ['a', 1],
    ['b', 1],
  ]);
});

it('free with nothing open: no query at all', async () => {
  expect(await fetchSearchableWordGroups(buildPracticeScope({ all: false, openLessons: [], openUnitIds: [] }))).toEqual([]);
  expect(mockDb.queries).toEqual([]);
});

it('a row that comes back outside the scope or not approved is still dropped', async () => {
  mockDb.respond('word_groups.select', {
    data: [groupRow('a', 'u1', 1), groupRow('locked', 'u1', 9), groupRow('draft', 'u1', 1, 'draft')],
    error: null,
  });
  mockDb.respond('word_variants.select', { data: [variantRow('va', 'a')], error: null });
  const words = await fetchSearchableWordGroups(
    buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] })
  );
  expect(words.map((w: { id: string }) => w.id)).toEqual(['a']);
});

it('Premium: every approved word, in pages', async () => {
  const page1 = Array.from({ length: SEARCH_PAGE_SIZE }, (_, i) => groupRow(`p${i}`, 'u1', 1));
  mockDb.respond('word_groups.select', { data: page1, error: null }, { data: [groupRow('last', 'u2', 1)], error: null });
  mockDb.respond('word_variants.select', { data: [], error: null });
  const words = await fetchSearchableWordGroups(buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }));
  expect(words).toHaveLength(SEARCH_PAGE_SIZE + 1);
  const groupQueries = selects('word_groups');
  expect(groupQueries.map((q) => q.calls.find((c) => c[0] === 'range'))).toEqual([
    ['range', 0, SEARCH_PAGE_SIZE - 1],
    ['range', SEARCH_PAGE_SIZE, 2 * SEARCH_PAGE_SIZE - 1],
  ]);
  expect(approvedOnly('word_groups')).toBe(true);
});

it('surfaces a failure (the screen shows "Search needs a connection")', async () => {
  mockDb.respond('word_groups.select', { data: null, error: { message: 'offline' } });
  await expect(
    fetchSearchableWordGroups(buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }))
  ).rejects.toMatchObject({ message: 'offline' });
});
