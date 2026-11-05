// The data layer in the guest preview (signed out, device only):
// - reads come only from the guest_preview_* views (selected, approved content);
// - every write (practice results, favorites, minutes, display settings) stays
//   on this device — no server writes, no Edge Function calls, nothing logged.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
const mockInvoke = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  supabase: { ...mockDb.client, rpc: (...a: unknown[]) => mockRpc(...a), functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } },
}));
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
    getAllKeys: jest.fn(async () => [...mockStore.keys()]),
    multiRemove: jest.fn(async (ks: string[]) => ks.forEach((k) => mockStore.delete(k))),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setGuestSessionActive } = require('@/lib/guest/guestSession');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const content = require('@/data/content');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const progress = require('@/data/progress');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const favorites = require('@/data/favorites');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sessionLogs = require('@/data/sessionLogs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const profiles = require('@/data/profiles');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const displayPrefs = require('@/data/displayPreferences');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getGuestData } = require('@/lib/guest/guestStore');

const UNIT = 'aaaaaaaa-0000-0000-0000-000000000001';
const LESSON = 'bbbbbbbb-0000-0000-0000-000000000001';

beforeEach(() => {
  mockDb.reset();
  mockInvoke.mockReset();
  mockRpc.mockReset();
  mockStore.clear();
  setGuestSessionActive(true);
  mockDb.respond('guest_preview_units.select', { data: [{ id: UNIT, name: 'Daily Phrases', sort_order: 1, is_curriculum: true }], error: null });
  mockDb.respond('guest_preview_lessons.select', { data: [{ id: LESSON, unit_id: UNIT, lesson_number: 8, title: 'Daily Phrases', sort_order: 1 }], error: null });
  mockDb.respond('guest_preview_word_groups.select', {
    data: [{ id: 'w1', unit_id: UNIT, lesson_number: 8, english_meaning: 'hello', image_keyword: null, image_path: null, sort_order: 1, content_status: 'approved' }],
    error: null,
  });
  mockDb.respond('guest_preview_word_variants.select', {
    data: [{ id: 'v1', word_group_id: 'w1', variant_label: 'primary', word_arabic: 'أهلا', transliteration: 'ahla', audio_path: 'a.m4a',
             notes: null, sort_order: 0, native_verified: false, is_native_voice: false, content_status: 'approved', in_repeat_after_me: false, updated_at: '2026-01-01' }],
    error: null,
  });
});

afterEach(() => setGuestSessionActive(false));

const tablesRead = () => [...new Set(mockDb.queries.map((q) => q.table))];

it('reads only the guest views', async () => {
  const map = await content.fetchLessonMap('guest');
  expect(map[0].unit.name).toBe('Daily Phrases');
  expect(map[0].lessons[0]).toMatchObject({ id: LESSON, state: 'unlocked', wordCount: 1 });
  const words = await content.fetchWordGroupsForLesson(LESSON);
  expect(words[0]).toMatchObject({ id: 'w1', englishMeaning: 'hello', variants: [expect.objectContaining({ wordArabic: 'أهلا' })] });
  expect(tablesRead().every((t) => t.startsWith('guest_preview_'))).toBe(true);
});

it('practice results, favorites and minutes stay on the device — no server writes or function calls', async () => {
  const outcome = await progress.recordWordGroupResult('guest', 'w1', true);
  expect(outcome).toMatchObject({ correctCount: 1 });
  await favorites.addFavorite('guest', 'w1');
  expect(await favorites.fetchFavoriteWordGroupIds('guest')).toEqual(new Set(['w1']));
  await favorites.removeFavorite('guest', 'w1');
  await sessionLogs.recordSessionLog('guest', 'lesson', 120);
  await displayPrefs.saveDisplayPreferences('guest', { script: 'latin', form: 'both' });

  expect(mockDb.writes()).toEqual([]);
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
  expect((await getGuestData()).results.w1).toMatchObject({ correct: 1, incorrect: 0 });
});

it('progress read back for the guest comes from the device', async () => {
  await progress.recordWordGroupResult('guest', 'w1', false);
  expect(await progress.fetchProgressSummary('guest')).toMatchObject({ totalWordsSeen: 1 });
  expect(await progress.fetchSeenWordGroupIds('guest', ['w1', 'w2'])).toEqual(new Set(['w1']));
  expect(await sessionLogs.fetchMinutesLearnedToday('guest')).toBe(0);
  expect(await profiles.fetchDailyGoalSettings('guest')).toBeNull();
  expect(mockDb.writes()).toEqual([]);
});

it('signed in, the same functions use the server as before', async () => {
  setGuestSessionActive(false);
  mockDb.respond('progress.select', { data: null, error: null });
  await progress.recordWordGroupResult('p1', 'w1', true);
  expect(mockDb.writes().map((w) => w.table)).toEqual(['progress']);
});
