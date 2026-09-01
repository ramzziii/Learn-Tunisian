export type LessonState = 'locked' | 'unlocked' | 'completed';

export interface LessonCompletionInput {
  lessonId: string;
  wordCount: number;
  masteredCount: number;
}

/**
 * Derives each lesson's lock state from word_group mastery, given lessons
 * already in their intended display order (unit sort_order, then lesson
 * sort_order within it — sorting is the caller's job, this only sequences).
 * A lesson is 'completed' once every word_group in it is mastered; the
 * first lesson is always unlocked; each subsequent lesson unlocks only once
 * the previous one is completed.
 */
export function computeLessonStates(lessons: LessonCompletionInput[]): Map<string, LessonState> {
  let previousCompleted = true;
  const states = new Map<string, LessonState>();

  for (const lesson of lessons) {
    const isCompleted = lesson.wordCount > 0 && lesson.masteredCount === lesson.wordCount;
    states.set(lesson.lessonId, isCompleted ? 'completed' : previousCompleted ? 'unlocked' : 'locked');
    previousCompleted = isCompleted;
  }

  return states;
}
