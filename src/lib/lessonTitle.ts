import type { LessonWithState } from '@/types/models';

const norm = (text: string) => text.trim().toLowerCase();

/**
 * What to call a lesson on screen: its own title, or "Lesson N" when it has
 * none or the title just repeats its unit's name (common when a unit has a
 * single lesson) — so the unit name isn't shown twice.
 */
export function lessonDisplayTitle(lesson: Pick<LessonWithState, 'title' | 'unitName' | 'lessonNumber'>): string {
  const title = lesson.title?.trim();
  if (!title || norm(title) === norm(lesson.unitName)) return `Lesson ${lesson.lessonNumber}`;
  return title;
}

/** True when the lesson has a title of its own (not the unit's name, not empty). */
export function hasOwnLessonTitle(lesson: Pick<LessonWithState, 'title' | 'unitName' | 'lessonNumber'>): boolean {
  return lessonDisplayTitle(lesson) !== `Lesson ${lesson.lessonNumber}`;
}
