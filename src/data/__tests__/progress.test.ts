// Core learning loop at the data layer: every exercise answer goes through
// recordWordGroupResult, and the Review screen is fed by fetchReviewQueue.
// Runs against a scripted fake Supabase (no credentials needed).
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordWordGroupResult, fetchReviewQueue } = require('@/data/progress');

const groupRow = (id: string) => ({
  id,
  unit_id: 'u1',
  lesson_number: 1,
  english_meaning: `meaning ${id}`,
  image_keyword: null,
  image_path: null,
  sort_order: 0,
  content_status: 'approved',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const variantRow = (id: string, groupId: string) => ({
  id,
  word_group_id: groupId,
  variant_label: 'primary',
  word_arabic: 'كلمة',
  transliteration: 'kelma',
  audio_path: `${groupId}/${id}.m4a`,
  notes: null,
  sort_order: 0,
  native_verified: false,
  content_status: 'approved',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  speaker_name: null,
  dialect_notes: null,
  is_native_voice: false,
  approved_by: null,
  approved_at: null,
});

beforeEach(() => mockDb.reset());

describe('recordWordGroupResult (every exercise answer)', () => {
  it('first-ever correct answer creates progress as "learning" and schedules a future review', async () => {
    mockDb.respond('progress.select', { data: null, error: null });

    const outcome = await recordWordGroupResult('p1', 'wg1', true);

    expect(outcome).toEqual({ correctCount: 1, status: 'learning' });
    const [write] = mockDb.writes();
    expect(write.operation).toBe('upsert');
    expect(write.options).toEqual({ onConflict: 'profile_id,word_group_id' });
    const row = write.payload as Record<string, unknown>;
    expect(row).toMatchObject({ profile_id: 'p1', word_group_id: 'wg1', correct_count: 1, incorrect_count: 0 });
    expect(new Date(row.next_review_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('a third correct answer marks the word mastered ("known")', async () => {
    mockDb.respond('progress.select', {
      data: {
        correct_count: 2,
        incorrect_count: 1,
        review_interval_days: 3,
        ease_factor: 2.5,
        consecutive_correct: 2,
        consecutive_incorrect: 0,
      },
      error: null,
    });

    await expect(recordWordGroupResult('p1', 'wg1', true)).resolves.toEqual({ correctCount: 3, status: 'known' });
  });

  it('a wrong answer counts against the word and resets its correct streak', async () => {
    mockDb.respond('progress.select', {
      data: {
        correct_count: 2,
        incorrect_count: 0,
        review_interval_days: 6,
        ease_factor: 2.5,
        consecutive_correct: 2,
        consecutive_incorrect: 0,
      },
      error: null,
    });

    const outcome = await recordWordGroupResult('p1', 'wg1', false);

    expect(outcome.correctCount).toBe(2);
    const row = mockDb.writes()[0].payload as Record<string, number>;
    expect(row.incorrect_count).toBe(1);
    expect(row.consecutive_correct).toBe(0);
    expect(row.consecutive_incorrect).toBe(1);
  });

  it('does not write anything if reading existing progress fails (no partial/blind overwrite)', async () => {
    mockDb.respond('progress.select', { data: null, error: { message: 'permission denied for table progress', code: '42501' } });

    await expect(recordWordGroupResult('p1', 'wg1', true)).rejects.toMatchObject({ code: '42501' });
    expect(mockDb.writes()).toHaveLength(0);
  });

  it('surfaces a rejected write (e.g. RLS) instead of reporting success', async () => {
    mockDb.respond('progress.select', { data: null, error: null });
    mockDb.respond('progress.upsert', { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } });

    await expect(recordWordGroupResult('p1', 'wg1', true)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fetchReviewQueue (Review screen)', () => {
  it('returns nothing — and loads no content — when nothing is due', async () => {
    mockDb.respond('progress.select', { data: [], error: null });

    await expect(fetchReviewQueue('p1')).resolves.toEqual([]);
    expect(mockDb.queries.map((q) => q.table)).toEqual(['progress']);
  });

  it('orders the queue most-overdue first and attaches each word’s variants (with audio paths)', async () => {
    mockDb.respond('progress.select', {
      data: [
        { word_group_id: 'recent', next_review_at: '2026-10-10T00:00:00Z', consecutive_incorrect: 0, correct_count: 1 },
        { word_group_id: 'oldest', next_review_at: '2026-09-01T00:00:00Z', consecutive_incorrect: 0, correct_count: 1 },
      ],
      error: null,
    });
    // DB returns rows in arbitrary order — the queue must not depend on it.
    mockDb.respond('word_groups.select', { data: [groupRow('recent'), groupRow('oldest')], error: null });
    mockDb.respond('word_variants.select', {
      data: [variantRow('v-recent', 'recent'), variantRow('v-oldest', 'oldest')],
      error: null,
    });

    const queue = await fetchReviewQueue('p1');

    expect(queue.map((g: { id: string }) => g.id)).toEqual(['oldest', 'recent']);
    expect(queue[0].variants[0].audioPath).toBe('oldest/v-oldest.m4a');
  });

  it('pulls in struggling words even before they are due', async () => {
    mockDb.respond('progress.select', { data: [], error: null });

    await fetchReviewQueue('p1');

    const orFilter = mockDb.queries[0].calls.find((c) => c[0] === 'or')?.[1] as string;
    expect(orFilter).toMatch(/next_review_at\.lte\./);
    expect(orFilter).toMatch(/consecutive_incorrect\.gte\.2/);
  });

  it('skips due progress rows whose word was deleted, rather than crashing', async () => {
    mockDb.respond('progress.select', {
      data: [
        { word_group_id: 'deleted', next_review_at: '2026-09-01T00:00:00Z', consecutive_incorrect: 0, correct_count: 1 },
        { word_group_id: 'kept', next_review_at: '2026-09-02T00:00:00Z', consecutive_incorrect: 0, correct_count: 1 },
      ],
      error: null,
    });
    mockDb.respond('word_groups.select', { data: [groupRow('kept')], error: null });
    mockDb.respond('word_variants.select', { data: [], error: null });

    const queue = await fetchReviewQueue('p1');
    expect(queue.map((g: { id: string }) => g.id)).toEqual(['kept']);
  });
});
