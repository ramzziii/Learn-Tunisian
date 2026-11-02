// Lessons with no approved words are hidden from the lesson map (signed in
// and guest), so imported draft-only lessons never show up empty and never
// block progression: a lesson only completes once it has words, so an empty
// one would otherwise lock every lesson after it.
// - an empty lesson between two lessons is skipped: the next one unlocks as
//   soon as the one before is completed;
// - a hidden lesson never counts as current;
// - once its first word is approved it appears in place, under the normal rule;
// - a unit with only hidden lessons disappears; one with some keeps those.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchLessonMap } = require('@/data/content');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setGuestSessionActive } = require('@/lib/guest/guestSession');

const unit = (id: string, sort: number) => ({ id, name: `Unit ${id}`, sort_order: sort, is_curriculum: true });
const lesson = (id: string, unitId: string, n: number) => ({ id, unit_id: unitId, lesson_number: n, title: id, sort_order: n });
const group = (id: string, unitId: string, n: number) => ({
  id, unit_id: unitId, lesson_number: n, english_meaning: id, image_keyword: null, image_path: null, sort_order: 1, content_status: 'approved',
});

// u1: l1 (word a, mastered), l2 (no approved words), l3 (word c)
// u2: l4 (no approved words)  -> whole unit hidden
const UNITS = [unit('u1', 1), unit('u2', 2)];
const LESSONS = [lesson('l1', 'u1', 1), lesson('l2', 'u1', 2), lesson('l3', 'u1', 3), lesson('l4', 'u2', 4)];

const shape = (map: { unit: { id: string }; lessons: { id: string; state: string }[] }[]) =>
  map.map(({ unit: u, lessons }) => ({ unit: u.id, lessons: lessons.map((l) => `${l.id}:${l.state}`) }));

describe('signed in', () => {
  beforeEach(() => {
    mockDb.reset();
    setGuestSessionActive(false);
    mockDb.respond('units.select', { data: UNITS, error: null });
    mockDb.respond('lessons.select', { data: LESSONS, error: null });
    mockDb.respond('progress.select', { data: [{ word_group_id: 'a', correct_count: 1 }], error: null });
  });

  it('skips the empty lesson: the next lesson unlocks once the previous one is completed', async () => {
    mockDb.respond('word_groups.select', { data: [group('a', 'u1', 1), group('c', 'u1', 3)], error: null });
    expect(shape(await fetchLessonMap('p1'))).toEqual([{ unit: 'u1', lessons: ['l1:completed', 'l3:unlocked'] }]);
  });

  it('a lesson appears in place once its first word is approved, under the normal unlock rule', async () => {
    mockDb.respond('word_groups.select', { data: [group('a', 'u1', 1), group('b', 'u1', 2), group('c', 'u1', 3)], error: null });
    expect(shape(await fetchLessonMap('p1'))).toEqual([{ unit: 'u1', lessons: ['l1:completed', 'l2:unlocked', 'l3:locked'] }]);
  });

  it('an empty first lesson never becomes the current one', async () => {
    mockDb.respond('progress.select', { data: [], error: null });
    mockDb.respond('word_groups.select', { data: [group('c', 'u1', 3)], error: null });
    expect(shape(await fetchLessonMap('p1'))).toEqual([{ unit: 'u1', lessons: ['l3:unlocked'] }]);
  });

  it('a unit whose lessons are all empty disappears; nothing approved means an empty map', async () => {
    mockDb.respond('word_groups.select', { data: [], error: null });
    expect(await fetchLessonMap('p1')).toEqual([]);
  });
});

describe('guest preview', () => {
  beforeEach(() => {
    mockDb.reset();
    setGuestSessionActive(true);
    mockDb.respond('guest_preview_units.select', { data: UNITS, error: null });
    mockDb.respond('guest_preview_lessons.select', { data: LESSONS, error: null });
    mockDb.respond('guest_preview_word_variants.select', {
      data: ['a', 'c'].map((g) => ({
        id: `v-${g}`, word_group_id: g, variant_label: 'primary', word_arabic: 'كلمة', transliteration: g, audio_path: null,
        notes: null, sort_order: 0, native_verified: false, is_native_voice: false, content_status: 'approved', in_repeat_after_me: false,
        updated_at: '2026-01-01',
      })),
      error: null,
    });
  });
  afterEach(() => setGuestSessionActive(false));

  it('hides empty lessons and units the same way', async () => {
    mockDb.respond('guest_preview_word_groups.select', { data: [group('a', 'u1', 1), group('c', 'u1', 3)], error: null });
    expect(shape(await fetchLessonMap('guest'))).toEqual([{ unit: 'u1', lessons: ['l1:unlocked', 'l3:locked'] }]);
  });
});
