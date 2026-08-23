import { supabase } from '@/lib/supabase/client';
import { mapLesson, mapUnit, mapWord } from '@/data/mappers';
import type { LessonRow, UnitRow, WordRow } from '@/types/database';
import type { LessonWithState, Word } from '@/types/models';

export interface UnitWithLessons {
  unit: ReturnType<typeof mapUnit>;
  lessons: LessonWithState[];
}

/**
 * Units -> lessons, annotated with this profile's per-lesson progress and
 * derived lock state. A lesson is "completed" once every word in it has
 * been answered correctly at least once; the next lesson (by sort_order
 * within its unit, then unit sort_order) unlocks once the previous one
 * completes. The very first lesson is always unlocked.
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
  const lessonIds = lessons.map((l) => l.id);

  const { data: wordRows, error: wordsError } = await supabase
    .from('words')
    .select('*')
    .in('lesson_id', lessonIds.length > 0 ? lessonIds : ['00000000-0000-0000-0000-000000000000']);
  if (wordsError) throw wordsError;
  const words = (wordRows ?? []) as WordRow[];

  const { data: progressRows, error: progressError } = await supabase
    .from('progress')
    .select('word_id, correct_count')
    .eq('profile_id', profileId);
  if (progressError) throw progressError;
  const masteredWordIds = new Set(
    (progressRows ?? []).filter((p) => p.correct_count > 0).map((p) => p.word_id as string)
  );

  const wordsByLesson = new Map<string, WordRow[]>();
  for (const word of words) {
    const list = wordsByLesson.get(word.lesson_id) ?? [];
    list.push(word);
    wordsByLesson.set(word.lesson_id, list);
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
    const lessonWords = wordsByLesson.get(lesson.id) ?? [];
    const masteredCount = lessonWords.filter((w) => masteredWordIds.has(w.id)).length;
    masteredByLessonId.set(lesson.id, masteredCount);
    const isCompleted = lessonWords.length > 0 && masteredCount === lessonWords.length;

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
        const lessonWords = wordsByLesson.get(lessonRow.id) ?? [];
        return {
          ...lesson,
          unitName: unit.name,
          wordCount: lessonWords.length,
          masteredCount: masteredByLessonId.get(lessonRow.id) ?? 0,
          state: stateByLessonId.get(lessonRow.id) ?? 'locked',
        } satisfies LessonWithState;
      });
    return { unit, lessons: unitLessons };
  });
}

export async function fetchWordsForLesson(lessonId: string): Promise<Word[]> {
  const { data, error } = await supabase
    .from('words')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map(mapWord);
}
