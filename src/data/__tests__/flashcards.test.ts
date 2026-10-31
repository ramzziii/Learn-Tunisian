// Flashcard data access: only approved content ever reaches a deck — the
// queries filter on content_status = 'approved' and anything else that comes
// back is dropped here too (RLS lets signed-in users read drafts, so this
// boundary is the gate). Runs against the scripted fake Supabase.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchFlashcardDecks, fetchFlashcards } = require('@/data/flashcards');

const groupRow = (id: string, unitId: string, status = 'approved') => ({
  id,
  unit_id: unitId,
  lesson_number: 1,
  english_meaning: `meaning ${id}`,
  image_keyword: null,
  image_path: null,
  sort_order: 0,
  content_status: status,
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});
const variantRow = (id: string, groupId: string, status = 'approved') => ({
  id,
  word_group_id: groupId,
  variant_label: 'primary',
  word_arabic: 'كلمة',
  transliteration: 'kelma',
  audio_path: null,
  notes: null,
  sort_order: 0,
  native_verified: false,
  content_status: status,
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

const query = (table: string) => mockDb.queries.find((q) => q.table === table && q.operation === 'select');
const hasApprovedFilter = (table: string) =>
  query(table)!.calls.some((c) => c[0] === 'eq' && c[1] === 'content_status' && c[2] === 'approved');

beforeEach(() => mockDb.reset());

describe('fetchFlashcardDecks', () => {
  beforeEach(() => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mockDb.respond('progress.select', {
      data: [
        { word_group_id: 'hello', next_review_at: past, consecutive_incorrect: 0, correct_count: 1 },
        { word_group_id: 'draft', next_review_at: past, consecutive_incorrect: 0, correct_count: 1 },
      ],
      error: null,
    });
    mockDb.respond('favorites.select', { data: [{ word_group_id: 'hello' }], error: null });
    mockDb.respond('word_groups.select', {
      data: [
        { id: 'hello', unit_id: 'greet', sort_order: 1, content_status: 'approved' },
        // Returned anyway (e.g. a filter regression): must still be dropped.
        { id: 'draft', unit_id: 'greet', sort_order: 2, content_status: 'draft' },
      ],
      error: null,
    });
    mockDb.respond('units.select', { data: [{ id: 'greet', name: 'Greetings', sort_order: 1 }], error: null });
  });

  it('reads this profile’s progress and favorites, and only approved words', async () => {
    await fetchFlashcardDecks('p1');
    expect(query('progress')!.calls).toContainEqual(['eq', 'profile_id', 'p1']);
    expect(query('favorites')!.calls).toContainEqual(['eq', 'profile_id', 'p1']);
    expect(hasApprovedFilter('word_groups')).toBe(true);
  });

  it('a word that isn’t approved is in no deck, even if the query returns it', async () => {
    const decks = await fetchFlashcardDecks('p1');
    expect(decks.flatMap((d: { cardIds: string[] }) => d.cardIds)).not.toContain('draft');
    expect(decks.find((d: { id: string }) => d.id === 'category-greet')).toMatchObject({ cardIds: ['hello'] });
  });

  it('writes nothing', async () => {
    await fetchFlashcardDecks('p1');
    expect(mockDb.writes()).toEqual([]);
  });
});

describe('fetchFlashcards', () => {
  it('loads approved words and approved forms only, in the order asked', async () => {
    mockDb.respond('word_groups.select', {
      data: [groupRow('b', 'u'), groupRow('a', 'u'), groupRow('x', 'u', 'pending_review')],
      error: null,
    });
    mockDb.respond('word_variants.select', {
      data: [variantRow('a1', 'a'), variantRow('b1', 'b'), variantRow('b2', 'b', 'draft'), variantRow('x1', 'x')],
      error: null,
    });

    const cards = await fetchFlashcards(['a', 'b', 'x']);

    expect(hasApprovedFilter('word_groups')).toBe(true);
    expect(hasApprovedFilter('word_variants')).toBe(true);
    expect(cards.map((c: { id: string }) => c.id)).toEqual(['a', 'b']);
    expect(cards[1].variants.map((v: { id: string }) => v.id)).toEqual(['b1']);
  });

  it('a word with no approved form is left out (nothing to show)', async () => {
    mockDb.respond('word_groups.select', { data: [groupRow('a', 'u')], error: null });
    mockDb.respond('word_variants.select', { data: [variantRow('a1', 'a', 'draft')], error: null });
    expect(await fetchFlashcards(['a'])).toEqual([]);
  });

  it('nothing asked, nothing fetched', async () => {
    expect(await fetchFlashcards([])).toEqual([]);
    expect(mockDb.queries).toHaveLength(0);
  });
});
