import { supabase } from '@/lib/supabase/client';
import { mapLesson, mapUnit, mapWordGroup, mapWordVariant } from '@/data/mappers';
import type { LessonRow, UnitRow, WordGroupRow, WordVariantRow } from '@/types/database';
import type { LessonWithState, WordGroupWithVariants } from '@/types/models';

export interface UnitWithLessons {
  unit: ReturnType<typeof mapUnit>;
  lessons: LessonWithState[];
}

/**
 * Units -> lessons, annotated with this profile's per-lesson progress and
 * derived lock state. word_groups aren't linked to lessons by a foreign key
 * (see supabase/migrations/0003_word_variants.sql) — a lesson's groups are
 * whichever word_groups share its (unit_id, lesson_number).
 *
 * A lesson is "completed" once every word_group in it has been answered
 * correctly at least once; the next lesson (by sort_order within its unit,
 * then unit sort_order) unlocks once the previous one completes. The very
 * first lesson is always unlocked.
 */
export async function fetchLessonMap(profileId: string): Promise<UnitWithLessons[]> {
  const [{ data: unitRows, error: unitsError }, { data: lessonRows, error: lessonsError }] =
    await Promise.all([
      supabase.from('units').select('*').order('sort_order'),
      supabase.from('lessons').select('*').order('sort_order'),
    ]);
  if (unitsError) throw unitsError;
  if (lessonsError) throw lessonsError;

  const units = (unitRows ?? []) as UnitRow[];
  const lessons = (lessonRows ?? []) as LessonRow[];

  const { data: groupRows, error: groupsError } = await supabase.from('word_groups').select('*');
  if (groupsError) throw groupsError;
  const groups = (groupRows ?? []) as WordGroupRow[];

  const { data: progressRows, error: progressError } = await supabase
    .from('progress')
    .select('word_group_id, correct_count')
    .eq('profile_id', profileId);
  if (progressError) throw progressError;
  const masteredGroupIds = new Set(
    (progressRows ?? []).filter((p) => p.correct_count > 0).map((p) => p.word_group_id as string)
  );

  const groupsByLesson = new Map<string, WordGroupRow[]>();
  const lessonKey = (unitId: string, lessonNumber: number) => `${unitId}:${lessonNumber}`;
  for (const group of groups) {
    const key = lessonKey(group.unit_id, group.lesson_number);
    const list = groupsByLesson.get(key) ?? [];
    list.push(group);
    groupsByLesson.set(key, list);
  }

  const sortedLessons = [...lessons].sort((a, b) => {
    const unitA = units.find((u) => u.id === a.unit_id);
    const unitB = units.find((u) => u.id === b.unit_id);
    const unitOrder = (unitA?.sort_order ?? 0) - (unitB?.sort_order ?? 0);
    return unitOrder !== 0 ? unitOrder : a.sort_order - b.sort_order;
  });

  let previousCompleted = true; // first lesson is always unlocked
  const stateByLessonId = new Map<string, LessonWithState['state']>();
  const masteredByLessonId = new Map<string, number>();

  for (const lesson of sortedLessons) {
    const lessonGroups = groupsByLesson.get(lessonKey(lesson.unit_id, lesson.lesson_number)) ?? [];
    const masteredCount = lessonGroups.filter((g) => masteredGroupIds.has(g.id)).length;
    masteredByLessonId.set(lesson.id, masteredCount);
    const isCompleted = lessonGroups.length > 0 && masteredCount === lessonGroups.length;

    const state: LessonWithState['state'] = isCompleted
      ? 'completed'
      : previousCompleted
        ? 'unlocked'
        : 'locked';
    stateByLessonId.set(lesson.id, state);
    previousCompleted = isCompleted;
  }

  return units.map((unitRow) => {
    const unit = mapUnit(unitRow);
    const unitLessons = lessons
      .filter((l) => l.unit_id === unitRow.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((lessonRow) => {
        const lesson = mapLesson(lessonRow);
        const lessonGroups = groupsByLesson.get(lessonKey(lessonRow.unit_id, lessonRow.lesson_number)) ?? [];
        return {
          ...lesson,
          unitName: unit.name,
          wordCount: lessonGroups.length,
          masteredCount: masteredByLessonId.get(lessonRow.id) ?? 0,
          state: stateByLessonId.get(lessonRow.id) ?? 'locked',
        } satisfies LessonWithState;
      });
    return { unit, lessons: unitLessons };
  });
}

export async function fetchWordGroupsForLesson(lessonId: string): Promise<WordGroupWithVariants[]> {
  const { data: lessonRow, error: lessonError } = await supabase
    .from('lessons')
    .select('unit_id, lesson_number')
    .eq('id', lessonId)
    .single<Pick<LessonRow, 'unit_id' | 'lesson_number'>>();
  if (lessonError) throw lessonError;

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('*')
    .eq('unit_id', lessonRow.unit_id)
    .eq('lesson_number', lessonRow.lesson_number)
    .order('sort_order');
  if (groupsError) throw groupsError;
  const groups = (groupRows ?? []) as WordGroupRow[];
  const groupIds = groups.map((g) => g.id);

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', groupIds.length > 0 ? groupIds : ['__none__'])
    .order('sort_order');
  if (variantsError) throw variantsError;
  const variants = (variantRows ?? []) as WordVariantRow[];

  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const variant of variants) {
    const list = variantsByGroup.get(variant.word_group_id) ?? [];
    list.push(variant);
    variantsByGroup.set(variant.word_group_id, list);
  }

  return groups.map((group) => ({
    ...mapWordGroup(group),
    variants: (variantsByGroup.get(group.id) ?? []).map(mapWordVariant),
  }));
}

/** A word_group plus every other word_group in the same lesson — the latter used as a practice distractor pool. */
export async function fetchWordGroupWithSiblings(
  wordGroupId: string
): Promise<{ group: WordGroupWithVariants; siblings: WordGroupWithVariants[] }> {
  const { data: groupRow, error: groupError } = await supabase
    .from('word_groups')
    .select('*')
    .eq('id', wordGroupId)
    .single<WordGroupRow>();
  if (groupError) throw groupError;

  const { data: siblingRows, error: siblingsError } = await supabase
    .from('word_groups')
    .select('*')
    .eq('unit_id', groupRow.unit_id)
    .eq('lesson_number', groupRow.lesson_number)
    .neq('id', wordGroupId);
  if (siblingsError) throw siblingsError;
  const siblings = (siblingRows ?? []) as WordGroupRow[];

  const allIds = [groupRow.id, ...siblings.map((g) => g.id)];
  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', allIds);
  if (variantsError) throw variantsError;

  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const variant of (variantRows as WordVariantRow[] | null) ?? []) {
    const list = variantsByGroup.get(variant.word_group_id) ?? [];
    list.push(variant);
    variantsByGroup.set(variant.word_group_id, list);
  }
  const toWithVariants = (row: WordGroupRow): WordGroupWithVariants => ({
    ...mapWordGroup(row),
    variants: (variantsByGroup.get(row.id) ?? []).map(mapWordVariant),
  });

  return { group: toWithVariants(groupRow), siblings: siblings.map(toWithVariants) };
}

export async function countCompletedLessons(profileId: string): Promise<number> {
  const unitsWithLessons = await fetchLessonMap(profileId);
  return unitsWithLessons.reduce(
    (total, { lessons }) => total + lessons.filter((lesson) => lesson.state === 'completed').length,
    0
  );
}
