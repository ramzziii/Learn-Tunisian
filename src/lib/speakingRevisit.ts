import { getPromptVariant } from '@/lib/wordVariants';
import type { ExerciseItem, ExerciseOutcome } from '@/types/exercises';
import type { WordGroupWithVariants } from '@/types/models';

/** Misses on one speaking exercise before the app moves on by itself and
 * queues the word to revisit at the end. */
export const SPEAKING_MISSES_BEFORE_REVISIT = 4;

/**
 * Keeps the ordered, de-duplicated list of words to revisit at the end of a
 * session: a word is added when it's left mispronounced, and removed if the
 * learner later says it correctly within the same session (lessons cycle the
 * same words, so that can happen before the end).
 */
export function updateRevisitList(
  list: readonly string[],
  groupId: string,
  exercise: Pick<ExerciseItem, 'type' | 'isRevisit'>,
  outcome: ExerciseOutcome = {}
): string[] {
  // Only speaking is revisited, and the revisit pass itself never re-queues
  // (one second chance, not an endless loop).
  if (exercise.type !== 'speaking' || exercise.isRevisit) return [...list];
  if (outcome.mispronounced) return list.includes(groupId) ? [...list] : [...list, groupId];
  return list.filter((id) => id !== groupId);
}

/** One speaking exercise per word to revisit, in the order they were missed. */
export function buildRevisitExercises(groupIds: readonly string[], groups: readonly WordGroupWithVariants[]): ExerciseItem[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  return groupIds
    .map((id) => byId.get(id))
    .filter((g): g is WordGroupWithVariants => !!g)
    .map((group, i) => ({
      key: `${group.id}-revisit-${i}`,
      type: 'speaking',
      targetGroup: group,
      promptVariant: getPromptVariant(group, i),
      options: [],
      isRevisit: true,
    }));
}
