import { fetchWordGroupsForLesson, type PhrasebookCategory } from '@/data/content';
import { computeFreeLessonIds, freePhrasebookUnitIds, PremiumRequiredError } from '@/lib/premium/access';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupWithVariants } from '@/types/models';

/** Lesson ids a free profile may open — see computeFreeLessonIds. */
export async function fetchFreeLessonIds(): Promise<Set<string>> {
  const [{ data: unitRows, error: unitsError }, { data: lessonRows, error: lessonsError }] = await Promise.all([
    supabase.from('units').select('id, sort_order, is_curriculum'),
    supabase.from('lessons').select('id, unit_id, sort_order'),
  ]);
  if (unitsError) throw unitsError;
  if (lessonsError) throw lessonsError;

  const units = ((unitRows ?? []) as { id: string; sort_order: number; is_curriculum: boolean }[]).map((u) => ({
    id: u.id,
    sortOrder: u.sort_order,
    isCurriculum: u.is_curriculum,
  }));
  const lessons = ((lessonRows ?? []) as { id: string; unit_id: string; sort_order: number }[]).map((l) => ({
    id: l.id,
    unitId: l.unit_id,
    sortOrder: l.sort_order,
  }));
  return computeFreeLessonIds(units, lessons);
}

/**
 * The single loading path for a lesson's word groups when they're about to
 * be shown to a learner (lesson session, word list, phrasebook category) —
 * for a free profile it checks the lesson is free *before* fetching any of
 * its content, so a direct link to a locked lesson never loads it.
 * Rejects with PremiumRequiredError when locked.
 */
export async function fetchAccessibleLessonWordGroups(
  lessonId: string,
  isPremium: boolean
): Promise<WordGroupWithVariants[]> {
  if (!isPremium) {
    const freeLessonIds = await fetchFreeLessonIds();
    if (!freeLessonIds.has(lessonId)) throw new PremiumRequiredError('This lesson');
  }
  return fetchWordGroupsForLesson(lessonId);
}

/** unitIds of the phrasebook categories a free profile may open, by sort_order. */
export function freePhrasebookCategoryIds(categories: readonly PhrasebookCategory[]): Set<string> {
  return freePhrasebookUnitIds(categories.map((c) => ({ id: c.unitId, sortOrder: c.sortOrder, isCurriculum: false })));
}

export const canAccessPhrasebookCategory = (
  isPremium: boolean,
  categoryId: string,
  categories: readonly PhrasebookCategory[]
): boolean => isPremium || freePhrasebookCategoryIds(categories).has(categoryId);
