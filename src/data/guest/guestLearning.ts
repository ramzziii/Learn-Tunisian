import type { UnitWithLessons } from '@/data/content';
import { fetchGuestLessons, fetchGuestUnits, fetchGuestWordGroups } from '@/data/guest/guestContent';
import { getGuestData, recordGuestResult, toggleGuestFavorite } from '@/lib/guest/guestStore';
import { computeLessonStates } from '@/lib/lessonCompletion';
import { calculateMasteryStatus } from '@/lib/masteryStatus';
import type { Favorite, Progress, WordGroupWithVariants } from '@/types/models';

/**
 * The guest preview's versions of the learning data functions: content from
 * the guest views, progress and favorites from the device (guestStore). The
 * normal data functions call these while the guest session is active, so the
 * screens themselves don't change.
 */

/** Lesson map for the guest: the selected curriculum lessons, locked/unlocked by device progress. */
export async function guestLessonMap(): Promise<UnitWithLessons[]> {
  const [units, lessons, words, data] = await Promise.all([fetchGuestUnits(), fetchGuestLessons(), fetchGuestWordGroups(), getGuestData()]);
  const curriculum = units.filter((u) => u.isCurriculum);
  const key = (unitId: string, n: number) => `${unitId}:${n}`;
  const wordsByLesson = new Map<string, WordGroupWithVariants[]>();
  for (const w of words) wordsByLesson.set(key(w.unitId, w.lessonNumber), [...(wordsByLesson.get(key(w.unitId, w.lessonNumber)) ?? []), w]);

  // Lessons with no approved words are hidden and left out of the unlock
  // order, as in fetchLessonMap (an empty lesson would lock the rest).
  const ordered = curriculum.flatMap((u) =>
    lessons
      .filter((l) => l.unitId === u.id && wordsByLesson.has(key(l.unitId, l.lessonNumber)))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({ unit: u, lesson: l }))
  );
  const counts = ordered.map(({ lesson }) => {
    const lessonWords = wordsByLesson.get(key(lesson.unitId, lesson.lessonNumber)) ?? [];
    return {
      lessonId: lesson.id,
      wordCount: lessonWords.length,
      masteredCount: lessonWords.filter((w) => (data.results[w.id]?.correct ?? 0) > 0).length,
    };
  });
  const states = computeLessonStates(counts);

  // A unit with no visible lessons isn't shown either.
  const shownUnits = curriculum.filter((u) => ordered.some(({ unit }) => unit.id === u.id));
  return shownUnits.map((u) => ({
    unit: { id: u.id, name: u.name, sortOrder: u.sortOrder, isCurriculum: true, createdBy: null, updatedBy: null, createdAt: '', updatedAt: '' },
    lessons: ordered
      .filter(({ unit }) => unit.id === u.id)
      .map(({ lesson }) => {
        const c = counts.find((x) => x.lessonId === lesson.id)!;
        return {
          id: lesson.id,
          unitId: lesson.unitId,
          lessonNumber: lesson.lessonNumber,
          title: lesson.title,
          sortOrder: lesson.sortOrder,
          createdBy: null,
          updatedBy: null,
          createdAt: '',
          updatedAt: '',
          unitName: u.name,
          wordCount: c.wordCount,
          masteredCount: c.masteredCount,
          state: states.get(lesson.id) ?? 'locked',
        };
      }),
  }));
}

/** A lesson's words for the guest (only selected, approved words exist in the views). */
export async function guestWordGroupsForLesson(lessonId: string): Promise<WordGroupWithVariants[]> {
  const lesson = (await fetchGuestLessons()).find((l) => l.id === lessonId);
  if (!lesson) return [];
  return fetchGuestWordGroups({ unitId: lesson.unitId, lessonNumber: lesson.lessonNumber });
}

export async function guestRecordResult(wordGroupId: string, wasCorrect: boolean) {
  await recordGuestResult(wordGroupId, wasCorrect);
  const correctCount = (await getGuestData()).results[wordGroupId]?.correct ?? 0;
  return { correctCount, status: calculateMasteryStatus(correctCount) };
}

export async function guestProgressFor(wordGroupId: string): Promise<Progress | null> {
  const r = (await getGuestData()).results[wordGroupId];
  if (!r) return null;
  return {
    id: `guest-${wordGroupId}`,
    profileId: 'guest',
    wordGroupId,
    status: calculateMasteryStatus(r.correct),
    correctCount: r.correct,
    incorrectCount: r.incorrect,
    nextReviewAt: r.lastSeenAt,
    reviewIntervalDays: 0,
    easeFactor: 2.5,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    lastSeenAt: r.lastSeenAt,
    createdAt: r.lastSeenAt,
    updatedAt: r.lastSeenAt,
  };
}

export async function guestPractisedIds(): Promise<string[]> {
  return Object.keys((await getGuestData()).results);
}

/** Words the guest practised in the preview (review / flashcards / speaking use only these), weakest first. */
export async function guestPractisedWords(limit?: number): Promise<WordGroupWithVariants[]> {
  const data = await getGuestData();
  const ids = Object.entries(data.results)
    .sort(([, a], [, b]) => a.correct - b.correct || b.incorrect - a.incorrect)
    .map(([id]) => id)
    .slice(0, limit ?? undefined);
  const words = await fetchGuestWordGroups({ ids });
  return ids.map((id) => words.find((w) => w.id === id)).filter((w): w is WordGroupWithVariants => !!w);
}

export async function guestSummary() {
  const results = Object.values((await getGuestData()).results);
  return {
    wordsLearning: results.filter((r) => calculateMasteryStatus(r.correct) === 'learning').length,
    wordsMastered: results.filter((r) => calculateMasteryStatus(r.correct) === 'known').length,
    wordsReviewed: results.filter((r) => r.correct + r.incorrect >= 2).length,
    totalWordsSeen: results.length,
  };
}

export async function guestFavoriteIds(): Promise<Set<string>> {
  return new Set((await getGuestData()).favorites);
}

export async function guestSetFavorite(wordGroupId: string, on: boolean): Promise<Favorite> {
  const isOn = (await getGuestData()).favorites.includes(wordGroupId);
  if (isOn !== on) await toggleGuestFavorite(wordGroupId);
  return { id: `guest-${wordGroupId}`, profileId: 'guest', wordGroupId, createdAt: new Date().toISOString() };
}

export async function guestFavoriteWords(): Promise<WordGroupWithVariants[]> {
  const ids = (await getGuestData()).favorites;
  const words = await fetchGuestWordGroups({ ids });
  return ids.map((id) => words.find((w) => w.id === id)).filter((w): w is WordGroupWithVariants => !!w);
}
