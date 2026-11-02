import type { LessonWithState } from '@/types/models';

/**
 * How lessons are named on learner screens. "Lesson N" always means the
 * lesson's 1-based position within its own unit — never lessons.lesson_number,
 * which the database counts across the whole course (e.g. Colors = 4,
 * Animals = 5, Daily Phrases = 8). Ordering, unlocking and routes keep using
 * the real fields; this is display only.
 */

type TitledLesson = Pick<LessonWithState, 'title' | 'unitName'>;

const norm = (text: string) => text.trim().toLowerCase();

/**
 * Each lesson's position within its unit, keyed by lesson id. Expects the
 * lesson map's order (units in order, each unit's lessons by sort_order —
 * fetchLessonMap already returns them that way).
 */
export function lessonPositions(units: readonly { lessons: readonly { id: string }[] }[]): Map<string, number> {
  const positions = new Map<string, number>();
  for (const { lessons } of units) {
    lessons.forEach((lesson, index) => positions.set(lesson.id, index + 1));
  }
  return positions;
}

/** True when the lesson has a title of its own (not empty, not just its unit's name). */
export function hasOwnLessonTitle(lesson: TitledLesson): boolean {
  const title = lesson.title?.trim();
  return !!title && norm(title) !== norm(lesson.unitName);
}

/** The lesson's own title, or "Lesson N" by its position in the unit. */
export function lessonDisplayTitle(lesson: TitledLesson, positionInUnit: number): string {
  return hasOwnLessonTitle(lesson) ? lesson.title!.trim() : `Lesson ${positionInUnit}`;
}
