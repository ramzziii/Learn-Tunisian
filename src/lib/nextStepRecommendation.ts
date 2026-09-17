import type { LessonWithState } from '@/types/models';

export type NextStepRecommendation =
  | { type: 'review'; dueCount: number }
  | { type: 'lesson'; lesson: LessonWithState; reason: 'weak_spot' | 'continue' };

/**
 * What to nudge the learner toward next, in priority order: words due for
 * review outrank new material (spaced repetition only works if reviews
 * actually happen), then the *weakest* unlocked lesson — lowest
 * mastered/word ratio — rather than just the next one in sequence, so a
 * learner who's shaky on an earlier lesson gets pointed back at it instead
 * of always marching forward. Returns null only when there's truly nothing
 * to recommend (no lessons unlocked and nothing due).
 */
export function recommendNextStep(lessons: LessonWithState[], reviewDueCount: number): NextStepRecommendation | null {
  if (reviewDueCount > 0) return { type: 'review', dueCount: reviewDueCount };

  const unlockedLessons = lessons.filter((lesson) => lesson.state === 'unlocked');
  if (unlockedLessons.length === 0) return null;

  const weakest = unlockedLessons.reduce((current, lesson) => {
    const ratio = lesson.wordCount > 0 ? lesson.masteredCount / lesson.wordCount : 0;
    const currentRatio = current.wordCount > 0 ? current.masteredCount / current.wordCount : 0;
    return ratio < currentRatio ? lesson : current;
  });

  // Untouched (0 mastered) reads as "continue" rather than "weak" — "weak
  // spot" implies you've tried and struggled, not just haven't started yet.
  return { type: 'lesson', lesson: weakest, reason: weakest.masteredCount > 0 ? 'weak_spot' : 'continue' };
}
