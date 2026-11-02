import { fetchLessonMap, fetchWordGroupsForLesson } from '@/data/content';
import { fetchReviewQueue, fetchSeenWordGroupIds } from '@/data/progress';
import { loadRepeatAfterMeSession, type RepeatAfterMeItem } from '@/data/repeatAfterMe';
import { filterToPracticeScope, inPracticeScope, type PracticeScope } from '@/lib/access/practiceScope';
import { getRepeatAfterMeProgress } from '@/lib/repeatAfterMe/progress';
import { composeTodaysPractice, type TodaysPracticePlan } from '@/lib/todaysPractice';
import type { WordGroupWithVariants } from '@/types/models';

/**
 * Current lesson's words: all of them (distractor pool) and the unseen ones.
 * If the lesson isn't open yet, it's opened first through `openLesson`
 * (counted, like starting the lesson) — only when the allowance has room.
 */
async function loadNewWords(
  profileId: string,
  scope: PracticeScope,
  openLesson?: (lessonId: string) => Promise<boolean>
): Promise<{ newGroups: WordGroupWithVariants[]; lessonPool: WordGroupWithVariants[] }> {
  const units = await fetchLessonMap(profileId);
  const lessons = units.flatMap((u) => u.lessons);
  // Same "continue" lesson the rest of the app uses; nothing new once every
  // lesson is finished.
  const current = lessons.find((l) => l.state === 'unlocked');
  if (!current) return { newGroups: [], lessonPool: [] };
  const isOpen = inPracticeScope(scope, { unitId: current.unitId, lessonNumber: current.lessonNumber, contentStatus: 'approved' });
  if (!isOpen && !(openLesson && (await openLesson(current.id)))) return { newGroups: [], lessonPool: [] };

  // Lesson words are approved-only already (fetchWordGroupsForLesson).
  const lessonPool = (await fetchWordGroupsForLesson(current.id)).filter((g) => g.contentStatus === 'approved');
  const seen = await fetchSeenWordGroupIds(
    profileId,
    lessonPool.map((g) => g.id)
  );
  return { newGroups: lessonPool.filter((g) => !seen.has(g.id)), lessonPool };
}

async function loadRepeatAfterMe(
  profileId: string,
  unlimited: boolean,
  openIds: ReadonlySet<string>
): Promise<RepeatAfterMeItem[]> {
  const progress = await getRepeatAfterMeProgress(profileId);
  // Recordings already opened only (remaining 0) — Today's Practice never counts a new one.
  return (await loadRepeatAfterMeSession({ unlimited, openIds, remaining: 0, progress: progress.items })).items;
}

/**
 * Loads and composes a Today's Practice session from the existing systems:
 * the review queue, the current lesson, and Repeat After Me. Review words
 * come only from the practice scope (open lessons / categories, approved);
 * new words from the current lesson, opened first if needed (counted, like
 * starting it); Repeat After Me only offers recordings already opened (all
 * with Premium). A failing source just contributes nothing; only
 * all of them failing is an error.
 */
export async function loadTodaysPractice(options: {
  profileId: string;
  scope: PracticeScope;
  ramUnlimited: boolean;
  ramOpenIds: ReadonlySet<string>;
  /** Opens (counts) the current lesson when it isn't open yet; false at the limit. */
  openLesson?: (lessonId: string) => Promise<boolean>;
}): Promise<TodaysPracticePlan> {
  const { profileId, scope } = options;

  const [review, newWords, repeatAfterMe] = await Promise.allSettled([
    fetchReviewQueue(profileId).then((groups) => filterToPracticeScope(scope, groups)),
    loadNewWords(profileId, scope, options.openLesson),
    loadRepeatAfterMe(profileId, options.ramUnlimited, options.ramOpenIds),
  ]);
  if (review.status === 'rejected' && newWords.status === 'rejected' && repeatAfterMe.status === 'rejected') {
    throw review.reason;
  }

  return composeTodaysPractice({
    reviewGroups: review.status === 'fulfilled' ? review.value : [],
    newGroups: newWords.status === 'fulfilled' ? newWords.value.newGroups : [],
    lessonPool: newWords.status === 'fulfilled' ? newWords.value.lessonPool : [],
    repeatAfterMeItems: repeatAfterMe.status === 'fulfilled' ? repeatAfterMe.value : [],
  });
}
