// Flashcard data access: only approved content ever reaches a deck — the
// queries filter on content_status = 'approved' and anything else that comes
// back is dropped here too (RLS lets signed-in users read drafts, so this
// boundary is the gate). Runs against the scripted fake Supabase.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));

let mockGuest = false;
jest.mock('@/lib/guest/guestSession', () => ({ isGuestSessionActive: () => mockGuest }));
const mockGuestWords = jest.fn();
const mockGuestFavoriteIds = jest.fn();
const mockGuestProgressFor = jest.fn();
jest.mock('@/data/guest/guestLearning', () => ({
  guestPractisedWords: (...a: unknown[]) => mockGuestWords(...a),
  guestFavoriteWords: jest.fn(async () => []),
  guestFavoriteIds: (...a: unknown[]) => mockGuestFavoriteIds(...a),
  guestProgressFor: (...a: unknown[]) => mockGuestProgressFor(...a),
}));
const mockGuestUnits = jest.fn();
const mockGuestWordGroups = jest.fn();
jest.mock('@/data/guest/guestContent', () => ({
  fetchGuestUnits: (...a: unknown[]) => mockGuestUnits(...a),
  fetchGuestWordGroups: (...a: unknown[]) => mockGuestWordGroups(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchFlashcardDecks, fetchFlashcards } = require('@/data/flashcards');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildPracticeScope } = require('@/lib/access/practiceScope');
const ALL = buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] });

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

beforeEach(() => {
  mockDb.reset();
  mockGuest = false;
});

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
    await fetchFlashcardDecks('p1', ALL);
    expect(query('progress')!.calls).toContainEqual(['eq', 'profile_id', 'p1']);
    expect(query('favorites')!.calls).toContainEqual(['eq', 'profile_id', 'p1']);
    expect(hasApprovedFilter('word_groups')).toBe(true);
  });

  it('a word that isn’t approved is in no deck, even if the query returns it', async () => {
    const decks = await fetchFlashcardDecks('p1', ALL);
    expect(decks.flatMap((d: { cardIds: string[] }) => d.cardIds)).not.toContain('draft');
    expect(decks.find((d: { id: string }) => d.id === 'category-greet')).toMatchObject({ cardIds: ['hello'] });
  });

  it('writes nothing', async () => {
    await fetchFlashcardDecks('p1', ALL);
    expect(mockDb.writes()).toEqual([]);
  });

  it('only words from open lessons / categories reach a deck (practice scope)', async () => {
    mockDb.respond('word_groups.select', {
      data: [
        { id: 'hello', unit_id: 'greet', lesson_number: 1, sort_order: 1, content_status: 'approved' },
        { id: 'bye', unit_id: 'greet', lesson_number: 2, sort_order: 2, content_status: 'approved' },
      ],
      error: null,
    });
    mockDb.respond('progress.select', {
      data: [
        { word_group_id: 'hello', next_review_at: new Date().toISOString(), consecutive_incorrect: 0, correct_count: 1 },
        { word_group_id: 'bye', next_review_at: new Date().toISOString(), consecutive_incorrect: 0, correct_count: 1 },
      ],
      error: null,
    });
    const scope = buildPracticeScope({ all: false, openLessons: [{ unitId: 'greet', lessonNumber: 1 }], openUnitIds: [] });
    const decks = await fetchFlashcardDecks('p1', scope);
    const ids = decks.flatMap((d: { cardIds: string[] }) => d.cardIds);
    expect(ids).toContain('hello');
    expect(ids).not.toContain('bye');
  });

  it('guest: decks from the preview words practised on this device — no server reads of progress or favorites', async () => {
    mockGuest = true;
    mockGuestWords.mockResolvedValue([
      { id: 'g1', unitId: 'gu', lessonNumber: 1, sortOrder: 1, contentStatus: 'approved', variants: [] },
    ]);
    mockGuestFavoriteIds.mockResolvedValue(new Set(['g1']));
    mockGuestProgressFor.mockResolvedValue({ wordGroupId: 'g1', nextReviewAt: new Date().toISOString(), consecutiveIncorrect: 0, correctCount: 1 });
    mockGuestUnits.mockResolvedValue([{ id: 'gu', name: 'Greetings', sortOrder: 1 }]);
    const decks = await fetchFlashcardDecks('guest', ALL);
    expect(decks.flatMap((d: { cardIds: string[] }) => d.cardIds)).toContain('g1');
    expect(mockDb.queries).toEqual([]);
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
