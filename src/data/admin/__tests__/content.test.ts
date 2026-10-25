// Admin CMS writes and how Supabase rejections reach the admin UI. The real
// RLS policies themselves can only be exercised against a database — see
// docs/TESTING.md ("Database-level checks") — these cover the client side:
// what gets written, and that every rejection surfaces instead of looking
// like success.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('@/data/admin/content');

const variantRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  word_group_id: 'wg1',
  variant_label: 'primary',
  word_arabic: 'عسلامة',
  transliteration: '3aslema',
  audio_path: 'wg1/v1-1000.m4a',
  notes: null,
  sort_order: 0,
  native_verified: false,
  content_status: 'approved',
  created_by: 'admin-1',
  updated_by: 'admin-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-10-13T00:00:00Z',
  speaker_name: null,
  dialect_notes: null,
  is_native_voice: false,
  approved_by: null,
  approved_at: null,
  ...overrides,
});

beforeEach(() => mockDb.reset());

describe('updateWordVariant', () => {
  it('writes only the fields being changed, stamps the editor, and targets one variant', async () => {
    mockDb.respond('word_variants.update', { data: variantRow({ audio_path: 'wg1/v1-2000.m4a' }), error: null });

    const updated = await admin.updateWordVariant('v1', { audioPath: 'wg1/v1-2000.m4a' }, 'admin-2');

    const [write] = mockDb.writes();
    expect(write.payload).toEqual({ audio_path: 'wg1/v1-2000.m4a', updated_by: 'admin-2' });
    expect(write.calls).toContainEqual(['eq', 'id', 'v1']);
    // Returns the row as saved — the audio flow verifies the path from this.
    expect(updated.audioPath).toBe('wg1/v1-2000.m4a');
  });

  it('marking native-verified records who approved it and when; un-verifying clears both', async () => {
    mockDb.respond('word_variants.update', { data: variantRow(), error: null });

    await admin.updateWordVariant('v1', { nativeVerified: true }, 'admin-2');
    await admin.updateWordVariant('v1', { nativeVerified: false }, 'admin-2');

    const [verify, unverify] = mockDb.writes().map((w) => w.payload as Record<string, unknown>);
    expect(verify).toMatchObject({ native_verified: true, approved_by: 'admin-2' });
    expect(Date.parse(verify.approved_at as string)).not.toBeNaN();
    expect(unverify).toMatchObject({ native_verified: false, approved_by: null, approved_at: null });
  });

  it('rejects when the update matched no row (RLS-filtered or deleted) — never a silent success', async () => {
    // .single() on a 0-row result is how PostgREST reports an update RLS
    // silently filtered out — the admin audio save depends on this rejecting.
    mockDb.respond('word_variants.update', {
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
    });

    await expect(admin.updateWordVariant('v1', { audioPath: 'x.m4a' }, 'admin-2')).rejects.toMatchObject({ code: 'PGRST116' });
  });

  it('passes a permission denial through unchanged, not disguised as a content-rule error', async () => {
    mockDb.respond('word_variants.update', { data: null, error: { message: 'permission denied for table word_variants', code: '42501' } });

    const failure = admin.updateWordVariant('v1', { notes: 'x' }, 'admin-2');
    await expect(failure).rejects.toMatchObject({ code: '42501' });
    await expect(failure).rejects.not.toBeInstanceOf(admin.AdminConstraintError);
  });
});

describe('content-rule violations become admin-readable errors', () => {
  it('a second primary variant explains the one-primary rule', async () => {
    mockDb.respond('word_variants.update', {
      data: null,
      error: { message: 'duplicate key value violates unique constraint "word_variants_one_primary_idx"', code: '23505' },
    });

    const failure = admin.updateWordVariant('v2', { variantLabel: 'primary' }, 'admin-1');
    await expect(failure).rejects.toBeInstanceOf(admin.AdminConstraintError);
    await expect(failure).rejects.toThrow(/already has a primary variant/);
  });

  it('deleting the variant that keeps a group valid explains the primary/gender-pair rule', async () => {
    mockDb.respond('word_variants.delete', {
      data: null,
      error: { message: 'word_group "wg1" must have exactly one primary variant, or both a masculine and a feminine variant', code: 'P0001' },
    });

    await expect(admin.deleteWordVariant('v1')).rejects.toThrow(/needs exactly one "primary" variant/);
  });

  it('a duplicate lesson number in a unit says so', async () => {
    mockDb.respond('lessons.insert', {
      data: null,
      error: { message: 'duplicate key value violates unique constraint "lessons_unit_lesson_number_key"', code: '23505' },
    });

    const create = admin.createLesson({ unitId: 'u1', lessonNumber: 1, title: null, sortOrder: 0 }, 'admin-1');
    await expect(create).rejects.toThrow(/already exists in this unit/);
  });
});
