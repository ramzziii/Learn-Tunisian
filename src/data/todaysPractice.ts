import { fetchLessonMap } from '@/data/content';
import { fetchAccessibleLessonWordGroups } from '@/data/premiumAccess';
import { fetchReviewQueue, fetchSeenWordGroupIds } from '@/data/progress';
import { loadRepeatAfterMeSession, type RepeatAfterMeItem } from '@/data/repeatAfterMe';
import { canAccessLesson, computeFreeLessonIds } from '@/lib/premium/access';
import { hasUsedFreeReviewToday } from '@/lib/premium/freeAllowance';
import { getRepeatAfterMeProgress } from '@/lib/repeatAfterMe/progress';
import { composeTodaysPractice, type TodaysPracticePlan } from '@/lib/todaysPractice';
import type { WordGroupWithVariants } from '@/types/models';

/** Current lesson's words: all of them (distractor pool) and the unseen ones. */
async function loadNewWords(
  profileId: string,
  isPremium: boolean
): Promise<{ newGroups: WordGroupWithVariants[]; lessonPool: WordGroupWithVariants[] }> {
  const units = await fetchLessonMap(profileId);
  const lessons = units.flatMap((u) => u.lessons);
  // Same "continue" lesson the rest of the app uses; nothing new once every
  // lesson is finished.
  const current = lessons.find((l) => l.state === 'unlocked');
  if (!current) return { newGroups: [], lessonPool: [] };
  const freeLessonIds = computeFreeLessonIds(
    units.map((u) => u.unit),
    lessons
  );
  if (!canAccessLesson(isPremium, current.id, freeLessonIds)) return { newGroups: [], lessonPool: [] };

  const lessonPool = await fetchAccessibleLessonWordGroups(current.id, isPremium);
  const seen = await fetchSeenWordGroupIds(
    profileId,
    lessonPool.map((g) => g.id)
  );
  return { newGroups: lessonPool.filter((g) => !seen.has(g.id)), lessonPool };
}

async function loadRepeatAfterMe(profileId: string, isPremium: boolean): Promise<RepeatAfterMeItem[]> {
  const progress = await getRepeatAfterMeProgress(profileId);
  return (await loadRepeatAfterMeSession({ isPremium, progress: progress.items })).items;
}

/**
 * Loads and composes a Today's Practice session from the existing systems:
 * the review queue, the current lesson (respecting free lesson access), and
 * Repeat After Me (respecting its own free cap). A free learner who already
 * used today's free review gets no review words — the queue isn't fetched.
 * A failing source just contributes nothing; only all of them failing is an
 * error.
 */
export async function loadTodaysPractice(options: {
  profileId: string;
  isPremium: boolean;
}): Promise<TodaysPracticePlan> {
  const { profileId, isPremium } = options;
  const freeReviewAvailable = isPremium ? true : !(await hasUsedFreeReviewToday(profileId).catch(() => true));

  const [review, newWords, repeatAfterMe] = await Promise.allSettled([
    isPremium || freeReviewAvailable ? fetchReviewQueue(profileId) : Promise.resolve([] as WordGroupWithVariants[]),
    loadNewWords(profileId, isPremium),
    loadRepeatAfterMe(profileId, isPremium),
  ]);
  if (review.status === 'rejected' && newWords.status === 'rejected' && repeatAfterMe.status === 'rejected') {
    throw review.reason;
  }

  return composeTodaysPractice({
    reviewGroups: review.status === 'fulfilled' ? review.value : [],
    newGroups: newWords.status === 'fulfilled' ? newWords.value.newGroups : [],
    lessonPool: newWords.status === 'fulfilled' ? newWords.value.lessonPool : [],
    repeatAfterMeItems: repeatAfterMe.status === 'fulfilled' ? repeatAfterMe.value : [],
    isPremium,
    freeReviewAvailable,
  });
}
