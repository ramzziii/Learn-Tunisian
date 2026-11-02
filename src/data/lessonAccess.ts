import { fetchLessonMap, fetchPhrasebookCategories } from '@/data/content';
import type { CountedFeature } from '@/lib/access/accessRules';

export interface LessonAccessTarget {
  feature: Extract<CountedFeature, 'lesson' | 'phrasebook_category'>;
  key: string;
  completed: boolean;
}

/**
 * What opening /lesson/[id] or /words/[id] counts as: a curriculum lesson
 * (and whether it's completed — a completed lesson always reopens), or the
 * phrasebook category the lesson backs. Null for a lesson that doesn't exist
 * or isn't visible (e.g. outside the guest preview). Both loaders already read
 * the guest preview views in guest mode.
 */
export async function fetchLessonAccessTarget(profileId: string, lessonId: string): Promise<LessonAccessTarget | null> {
  const units = await fetchLessonMap(profileId);
  for (const { lessons } of units) {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (lesson) return { feature: 'lesson', key: lesson.id, completed: lesson.state === 'completed' };
  }
  const category = (await fetchPhrasebookCategories()).find((c) => c.lessonId === lessonId);
  return category ? { feature: 'phrasebook_category', key: category.unitId, completed: false } : null;
}
