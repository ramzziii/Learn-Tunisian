// Repeat After Me content: only admin-recorded, admin-opted-in, approved
// content reaches learners; the free limit is enforced where items are
// loaded (not just in the UI); and the admin's opt-in/opt-out is persisted.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadRepeatAfterMeSession, setRepeatAfterMeInclusion } = require('@/data/repeatAfterMe');

const variantRow = (id: string, groupId: string, sortOrder = 0, overrides: Record<string, unknown> = {}) => ({
  id,
  word_group_id: groupId,
  variant_label: 'primary',
  word_arabic: 'عسلامة',
  transliteration: id,
  audio_path: `${groupId}/${id}-1000.m4a`,
  notes: null,
  sort_order: sortOrder,
  native_verified: true,
  content_status: 'approved',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  speaker_name: null,
  dialect_notes: null,
  is_native_voice: true,
  approved_by: null,
  approved_at: null,
  in_repeat_after_me: true,
  ...overrides,
});

const groupRow = (id: string, sortOrder: number) => ({
  id,
  unit_id: 'u1',
  lesson_number: 1,
  english_meaning: `meaning of ${id}`,
  image_keyword: null,
  image_path: null,
  sort_order: sortOrder,
  content_status: 'approved',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function seed(count: number) {
  const groups = Array.from({ length: count }, (_, i) => groupRow(`g${i + 1}`, i + 1));
  const variants = groups.map((g) => variantRow(`v-${g.id}`, g.id));
  mockDb.respond('word_variants.select', { data: [...variants].reverse(), error: null }); // DB order is arbitrary
  mockDb.respond('word_groups.select', { data: groups, error: null });
}

beforeEach(() => mockDb.reset());

describe('loadRepeatAfterMeSession', () => {
  it('asks only for opted-in, approved variants that have a recording', async () => {
    seed(2);
    await loadRepeatAfterMeSession({ isPremium: true, progress: {} });

    const variantQuery = mockDb.queries.find((q) => q.table === 'word_variants')!;
    expect(variantQuery.calls).toContainEqual(['eq', 'in_repeat_after_me', true]);
    expect(variantQuery.calls).toContainEqual(['eq', 'content_status', 'approved']);
    expect(variantQuery.calls).toContainEqual(['not', 'audio_path', 'is', null]);
    const groupQuery = mockDb.queries.find((q) => q.table === 'word_groups')!;
    expect(groupQuery.calls).toContainEqual(['eq', 'content_status', 'approved']);
  });

  it('drops items whose word group is not approved (draft content never reaches learners)', async () => {
    mockDb.respond('word_variants.select', { data: [variantRow('v1', 'g1'), variantRow('v2', 'g2')], error: null });
    mockDb.respond('word_groups.select', { data: [groupRow('g1', 1)], error: null }); // g2 filtered out by the query

    const { items } = await loadRepeatAfterMeSession({ isPremium: true, progress: {} });
    expect(items.map((i: { id: string }) => i.id)).toEqual(['v1']);
    expect(items[0]).toMatchObject({ englishMeaning: 'meaning of g1', variant: { audioPath: 'g1/v1-1000.m4a' } });
  });

  it('explanation recordings never reach Repeat After Me — items carry only the pronunciation', async () => {
    mockDb.respond('word_variants.select', {
      data: [variantRow('v1', 'g1', 0, { explanation_audio_path: 'g1/v1-explanation-9.m4a' })],
      error: null,
    });
    mockDb.respond('word_groups.select', { data: [groupRow('g1', 1)], error: null });

    const { items } = await loadRepeatAfterMeSession({ isPremium: true, progress: {} });

    expect(items[0].variant.audioPath).toBe('g1/v1-1000.m4a');
    expect(items[0].variant.explanationAudioPath).toBeNull();
  });

  it('a form with only an explanation (no pronunciation) is never an item', async () => {
    mockDb.respond('word_variants.select', {
      data: [variantRow('v1', 'g1', 0, { audio_path: null, explanation_audio_path: 'g1/v1-explanation-9.m4a' })],
      error: null,
    });
    mockDb.respond('word_groups.select', { data: [groupRow('g1', 1)], error: null });

    const { items } = await loadRepeatAfterMeSession({ isPremium: true, progress: {} });
    expect(items).toEqual([]);
  });

  it('Premium: every item, in stable content order', async () => {
    seed(8);
    const { items, lockedCount } = await loadRepeatAfterMeSession({ isPremium: true, progress: {} });
    expect(items.map((i: { id: string }) => i.id)).toEqual(['v-g1', 'v-g2', 'v-g3', 'v-g4', 'v-g5', 'v-g6', 'v-g7', 'v-g8']);
    expect(lockedCount).toBe(0);
  });

  it('free: at most five items are handed to the session; the rest are only counted', async () => {
    seed(8);
    const { items, lockedCount } = await loadRepeatAfterMeSession({ isPremium: false, progress: {} });
    expect(items).toHaveLength(5);
    expect(lockedCount).toBe(3);
  });

  it('free: items not yet marked correct come first, so later sessions move through the content', async () => {
    seed(7);
    const done = { attempts: 1, lastResult: 'correct', lastPracticedAt: '2026-10-01T00:00:00Z' };
    const { items } = await loadRepeatAfterMeSession({
      isPremium: false,
      progress: { 'v-g1': done, 'v-g2': done, 'v-g3': done },
    });
    expect(items.map((i: { id: string }) => i.id)).toEqual(['v-g4', 'v-g5', 'v-g6', 'v-g7', 'v-g1']);
  });

  it('nothing opted in → empty session, no group lookup', async () => {
    mockDb.respond('word_variants.select', { data: [], error: null });
    await expect(loadRepeatAfterMeSession({ isPremium: true, progress: {} })).resolves.toEqual({ items: [], lockedCount: 0 });
    expect(mockDb.queries.some((q) => q.table === 'word_groups')).toBe(false);
  });

  it('surfaces a load failure instead of showing an empty section', async () => {
    mockDb.respond('word_variants.select', { data: null, error: { message: 'column "in_repeat_after_me" does not exist', code: '42703' } });
    await expect(loadRepeatAfterMeSession({ isPremium: true, progress: {} })).rejects.toMatchObject({ code: '42703' });
  });
});

describe('setRepeatAfterMeInclusion (admin opt-in / opt-out)', () => {
  it('opt-in writes the flag on that variant, stamped with the admin, and returns the saved variant', async () => {
    mockDb.respond('word_variants.update', { data: variantRow('v1', 'g1', 0, { in_repeat_after_me: true }), error: null });

    const saved = await setRepeatAfterMeInclusion('v1', true, 'admin-1');

    const [write] = mockDb.writes();
    expect(write.payload).toEqual({ in_repeat_after_me: true, updated_by: 'admin-1' });
    expect(write.calls).toContainEqual(['eq', 'id', 'v1']);
    expect(saved.inRepeatAfterMe).toBe(true);
  });

  it('opt-out writes false', async () => {
    mockDb.respond('word_variants.update', { data: variantRow('v1', 'g1', 0, { in_repeat_after_me: false }), error: null });

    const saved = await setRepeatAfterMeInclusion('v1', false, 'admin-1');

    expect(mockDb.writes()[0].payload).toMatchObject({ in_repeat_after_me: false });
    expect(saved.inRepeatAfterMe).toBe(false);
  });

  it('rejects (never reports success) when the database refuses the change', async () => {
    mockDb.respond('word_variants.update', { data: null, error: { message: 'permission denied for table word_variants', code: '42501' } });
    await expect(setRepeatAfterMeInclusion('v1', true, 'admin-1')).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects when the saved row does not actually carry the requested choice', async () => {
    // e.g. the migration hasn't been applied, so the column comes back missing.
    const { in_repeat_after_me: _dropped, ...withoutColumn } = variantRow('v1', 'g1');
    mockDb.respond('word_variants.update', { data: withoutColumn, error: null });
    await expect(setRepeatAfterMeInclusion('v1', true, 'admin-1')).rejects.toThrow(/Repeat After Me/);
  });
});
