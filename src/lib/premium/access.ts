/**
 * Every free-vs-Premium boundary in the app, in one place, as pure functions
 * — screens, routes, and data loaders all ask these instead of deciding
 * locally, so a boundary can't drift between the list that shows an item
 * and the route that opens it.
 *
 * The `isPremium` these take is the *effective* entitlement from usePremium()
 * (src/lib/premium/PremiumContext.tsx): admins always have Premium (with an
 * optional free-plan preview), everyone else gets `profiles.is_premium`.
 * There is no purchase provider wired into the app yet (see
 * app/onboarding/plans.tsx), so nothing in the app ever flips that flag —
 * it's set server-side only.
 *
 * "First N" for bundled (local, non-Supabase) content is pinned to explicit
 * ids rather than array positions: those arrays have no sort field, so
 * reordering or inserting an entry would otherwise silently change what's
 * free. src/lib/__tests__/premiumAccess.test.ts asserts these ids still
 * exist and still lead their lists. Supabase-backed content (lessons,
 * phrasebook categories) uses its real sort_order columns instead.
 */

/** Grammar Notes: only "Basic Sentence Order" is free. */
export const FREE_GRAMMAR_NOTE_IDS: readonly string[] = ['sentence_order'];

/** Alphabet Practice, Alphabet Flashcards, and Diacritics: the first 3
 * letters in teaching order (ARABIC_LETTERS' documented pedagogical order). */
export const FREE_ALPHABET_LETTER_IDS: readonly string[] = ['alif', 'baa', 'taa'];

/** Culture Corner: the first 2 proverbs. */
export const FREE_PROVERB_IDS: readonly string[] = ['sleep_with_frogs', 'neighbor_before_house'];

/** Phrasebook: the first category by units.sort_order (Greetings, 100). */
export const FREE_PHRASEBOOK_CATEGORY_COUNT = 1;

/** Lessons: the first curriculum lesson by unit sort_order, then lesson sort_order. */
export const FREE_CURRICULUM_LESSON_COUNT = 1;

/** Review: one session per local day, capped at this many words. */
export const FREE_REVIEW_WORD_LIMIT = 10;

/** Speed Match: one lifetime sample round of this many pairs, drawn from the free letters. */
export const SPEED_MATCH_SAMPLE_PAIRS = 3;

export type AdminPremiumPreview = 'premium' | 'free';

/**
 * The entitlement every gate below is asked with. Admins (accounts.is_admin,
 * which only another admin can grant — see 0009_admin_content_management.sql)
 * always have full Premium access, and can switch to previewing the free
 * plan from their profile to see exactly what free learners see. Everyone
 * else gets their profile's is_premium.
 */
export function resolveEffectivePremium(input: {
  profileIsPremium: boolean;
  isAdmin: boolean;
  adminPreview: AdminPremiumPreview;
}): boolean {
  if (input.isAdmin) return input.adminPreview === 'premium';
  return input.profileIsPremium;
}

export const canAccessGrammarNote = (isPremium: boolean, noteId: string): boolean =>
  isPremium || FREE_GRAMMAR_NOTE_IDS.includes(noteId);

export const canAccessLetter = (isPremium: boolean, letterId: string): boolean =>
  isPremium || FREE_ALPHABET_LETTER_IDS.includes(letterId);

export const canAccessProverb = (isPremium: boolean, proverbId: string): boolean =>
  isPremium || FREE_PROVERB_IDS.includes(proverbId);

/** The letters a practice round may draw its questions from. */
export function accessibleLetters<T extends { id: string }>(isPremium: boolean, letters: readonly T[]): T[] {
  return letters.filter((letter) => canAccessLetter(isPremium, letter.id));
}

interface SortableUnit {
  id: string;
  sortOrder: number;
  isCurriculum: boolean;
}

interface SortableLesson {
  id: string;
  unitId: string;
  sortOrder: number;
}

// Ties fall back to id so the result never depends on query/array order.
const bySortOrderThenId = (a: { sortOrder: number; id: string }, b: { sortOrder: number; id: string }) =>
  a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** unitIds of the free phrasebook categories (non-curriculum units). */
export function freePhrasebookUnitIds(units: readonly SortableUnit[]): Set<string> {
  return new Set(
    units
      .filter((u) => !u.isCurriculum)
      .sort(bySortOrderThenId)
      .slice(0, FREE_PHRASEBOOK_CATEGORY_COUNT)
      .map((u) => u.id)
  );
}

/**
 * Every lesson id a free profile may open through /lesson/[lessonId] (and
 * the word list for it): the first curriculum lesson(s), plus the lesson
 * backing each free phrasebook category — the phrasebook's "Practice" button
 * reuses the same lesson route.
 */
export function computeFreeLessonIds(units: readonly SortableUnit[], lessons: readonly SortableLesson[]): Set<string> {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const curriculumLessons = lessons
    .filter((l) => unitById.get(l.unitId)?.isCurriculum)
    .sort((a, b) => {
      const unitOrder = bySortOrderThenId(unitById.get(a.unitId)!, unitById.get(b.unitId)!);
      return unitOrder !== 0 ? unitOrder : bySortOrderThenId(a, b);
    });

  const free = new Set(curriculumLessons.slice(0, FREE_CURRICULUM_LESSON_COUNT).map((l) => l.id));
  const freeCategoryUnitIds = freePhrasebookUnitIds(units);
  for (const lesson of lessons) {
    if (freeCategoryUnitIds.has(lesson.unitId)) free.add(lesson.id);
  }
  return free;
}

export const canAccessLesson = (isPremium: boolean, lessonId: string, freeLessonIds: ReadonlySet<string>): boolean =>
  isPremium || freeLessonIds.has(lessonId);

/** Whether a review session may start now. Decided before the session starts, never mid-session. */
export const canStartReview = (isPremium: boolean, freeReviewUsedToday: boolean): boolean =>
  isPremium || !freeReviewUsedToday;

/** Caps a due-review queue to the free allowance; Premium gets the full queue. */
export function limitReviewQueue<T>(isPremium: boolean, queue: readonly T[]): T[] {
  return isPremium ? [...queue] : queue.slice(0, FREE_REVIEW_WORD_LIMIT);
}

/** Whether a new Speed Match round may start. Decided before the round starts, never mid-round. */
export const canStartSpeedMatchRound = (isPremium: boolean, sampleRoundUsed: boolean): boolean =>
  isPremium || !sampleRoundUsed;

export const speedMatchPairCount = (isPremium: boolean, fullPairCount: number): number =>
  isPremium ? fullPairCount : SPEED_MATCH_SAMPLE_PAIRS;

export class PremiumRequiredError extends Error {
  constructor(what: string) {
    super(`${what} requires Premium.`);
    this.name = 'PremiumRequiredError';
  }
}
