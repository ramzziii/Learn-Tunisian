// "Words used" for learners (src/data/phraseWords.ts):
// - signed in: the phrase's links in saved order, with only approved words
//   (and their approved forms) — a link to an unapproved word is left out;
// - guest: only the guest preview views; a linked word outside the preview
//   comes back without its content (the card shows it locked);
// - nothing is written.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchWordsUsed } = require('@/data/phraseWords');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setGuestSessionActive } = require('@/lib/guest/guestSession');

const link = (word_id: string, position: number, shown_latin: string) => ({ phrase_id: 'pb_door', word_id, position, shown_arabic: 'كلمة', shown_latin });
const group = (id: string) => ({ id, unit_id: 'u1', lesson_number: 1, english_meaning: `meaning ${id}`, image_keyword: null, image_path: null, sort_order: 1, content_status: 'approved' });
const variant = (groupId: string) => ({
  id: `v-${groupId}`, word_group_id: groupId, variant_label: 'primary', word_arabic: 'كلمة', transliteration: groupId, audio_path: null, notes: null,
  sort_order: 0, native_verified: true, is_native_voice: false, content_status: 'approved', in_repeat_after_me: false, updated_at: '2026-01-01',
});

beforeEach(() => mockDb.reset());
afterEach(() => setGuestSessionActive(false));

describe('signed in', () => {
  it('saved order, approved words only (a link to an unapproved word is dropped)', async () => {
    mockDb.respond('phrase_word_links.select', { data: [link('close', 0, 'sakker'), link('please', 2, 'ya3ichek'), link('door', 1, 'beb')], error: null });
    mockDb.respond('word_groups.select', { data: [group('door'), group('close')], error: null });
    mockDb.respond('word_variants.select', { data: [variant('door'), variant('close')], error: null });

    const used = await fetchWordsUsed('pb_door');
    expect(used.map((u: { wordId: string; shownLatin: string; word: { englishMeaning: string } | null }) => [u.wordId, u.shownLatin, u.word?.englishMeaning])).toEqual([
      ['close', 'sakker', 'meaning close'],
      ['door', 'beb', 'meaning door'],
    ]);
    const groupsQuery = mockDb.queries.find((q) => q.table === 'word_groups')!;
    expect(groupsQuery.calls).toContainEqual(['eq', 'content_status', 'approved']);
    expect(mockDb.queries.every((q) => q.operation === 'select')).toBe(true);
  });

  it('no links: an empty list, no other reads', async () => {
    mockDb.respond('phrase_word_links.select', { data: [], error: null });
    expect(await fetchWordsUsed('pb_door')).toEqual([]);
    expect(mockDb.queries.map((q) => q.table)).toEqual(['phrase_word_links']);
  });

  it('a failed read is an error', async () => {
    mockDb.respond('phrase_word_links.select', { data: null, error: { message: 'network' } });
    await expect(fetchWordsUsed('pb_door')).rejects.toBeTruthy();
  });
});

describe('guest', () => {
  beforeEach(() => setGuestSessionActive(true));

  it('reads only the preview views; a word outside the preview comes back locked (no content)', async () => {
    mockDb.respond('guest_preview_phrase_word_links.select', { data: [link('close', 0, 'sakker'), link('door', 1, 'beb')], error: null });
    mockDb.respond('guest_preview_word_groups.select', { data: [group('door')], error: null });
    mockDb.respond('guest_preview_word_variants.select', { data: [variant('door')], error: null });

    const used = await fetchWordsUsed('pb_door');
    expect(used.map((u: { wordId: string; word: unknown }) => [u.wordId, u.word ? 'content' : 'locked'])).toEqual([
      ['close', 'locked'],
      ['door', 'content'],
    ]);
    expect(new Set(mockDb.queries.map((q) => q.table))).toEqual(
      new Set(['guest_preview_phrase_word_links', 'guest_preview_word_groups', 'guest_preview_word_variants'])
    );
  });
});
