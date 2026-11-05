// Content progress for the admin dashboard, per unit and overall:
// - words = word groups that aren't rejected or archived;
// - approved = approved word groups;
// - with native audio = approved words whose approved forms all have a native
//   recording (is_native_voice and a file);
// - awaiting review = draft or pending-review word groups;
// - needs recording = approved forms without a native recording, in working
//   order (unit, lesson, word, form) — same rule as the recording sheet.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeContentProgress, fetchContentProgress } = require('@/data/admin/contentProgress');

const units = [
  { id: 'u2', name: 'Food', sort_order: 2, is_curriculum: true },
  { id: 'u1', name: 'Greetings', sort_order: 1, is_curriculum: true },
  { id: 'pb', name: 'Shopping', sort_order: 107, is_curriculum: false },
];
const group = (id: string, unitId: string, status: string, lesson = 1, sort = 1) => ({
  id, unit_id: unitId, lesson_number: lesson, english_meaning: id, sort_order: sort, content_status: status,
});
const form = (groupId: string, label: string, status: string, native = false) => ({
  id: `${groupId}-${label}`, word_group_id: groupId, variant_label: label, content_status: status,
  is_native_voice: native, audio_path: native ? `${groupId}/${label}.mp3` : 'tts/placeholder.m4a',
});
const groups = [
  group('hello', 'u1', 'approved', 9, 1),
  group('welcome', 'u1', 'approved', 9, 2),
  group('yes', 'u1', 'draft', 10),
  group('no', 'u1', 'pending_review', 10),
  group('old', 'u1', 'rejected', 10),
  group('bread', 'u2', 'approved'),
  group('pb_hi', 'pb', 'approved'),
];
const variants = [
  form('hello', 'primary', 'approved', true),
  form('hello', 'also_heard', 'rejected'),
  form('welcome', 'masculine', 'approved', true),
  form('welcome', 'feminine', 'approved', false),
  form('yes', 'primary', 'draft'),
  form('no', 'primary', 'pending_review'),
  form('old', 'primary', 'rejected'),
  form('bread', 'primary', 'approved', true),
  form('pb_hi', 'primary', 'approved', false),
];

describe('computeContentProgress', () => {
  const progress = computeContentProgress(units, groups, variants);

  it('per unit, in unit order, Phrasebook categories marked', () => {
    expect(progress.units.map((u: { name: string; isPhrasebook: boolean }) => [u.name, u.isPhrasebook])).toEqual([
      ['Greetings', false],
      ['Food', false],
      ['Shopping', true],
    ]);
    expect(progress.units[0]).toMatchObject({ words: 4, approved: 2, withNativeAudio: 1, awaitingReview: 2 });
    expect(progress.units[1]).toMatchObject({ words: 1, approved: 1, withNativeAudio: 1, awaitingReview: 0 });
  });

  it('overall totals', () => {
    expect(progress.overall).toEqual({ words: 6, approved: 4, withNativeAudio: 2, awaitingReview: 2 });
  });

  it('needs recording: approved forms without a native recording, in working order', () => {
    expect(progress.needsRecording.map((n: { wordGroupId: string; variantLabel: string }) => `${n.wordGroupId}:${n.variantLabel}`)).toEqual([
      'welcome:feminine',
      'pb_hi:primary',
    ]);
  });
});

it('fetchContentProgress reads just the columns it needs', async () => {
  mockDb.respond('units.select', { data: units, error: null });
  mockDb.respond('word_groups.select', { data: groups, error: null });
  mockDb.respond('word_variants.select', { data: variants, error: null });
  const progress = await fetchContentProgress();
  expect(progress.overall.words).toBe(6);
  expect(mockDb.queries.map((q) => q.table).sort()).toEqual(['units', 'word_groups', 'word_variants']);
  expect(mockDb.queries.every((q) => q.operation === 'select')).toBe(true);
});

it('a failed read is an error, not zeros', async () => {
  mockDb.reset();
  mockDb.respond('units.select', { data: null, error: { message: 'permission denied' } });
  await expect(fetchContentProgress()).rejects.toBeTruthy();
});
