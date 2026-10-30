import { useCallback, useEffect, useRef, useState } from 'react';

import { getPromptVariant } from '@/lib/wordVariants';
import type { ExerciseItem, ExerciseOption, ExerciseType } from '@/types/exercises';
import type { WordGroupWithVariants } from '@/types/models';

const OPTION_COUNT = 4;
const TYPE_CYCLE: ExerciseType[] = ['reading_match', 'typing_spelling', 'speaking'];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Distractor options always come from different word_groups than the target — never another variant of the same group. */
export function buildOptions(
  targetGroup: WordGroupWithVariants,
  targetPromptVariant: ExerciseOption,
  allGroups: WordGroupWithVariants[],
  alternateSeed: number
): ExerciseOption[] {
  const distractorGroups = shuffled(allGroups.filter((g) => g.id !== targetGroup.id)).slice(
    0,
    OPTION_COUNT - 1
  );
  const distractorOptions: ExerciseOption[] = distractorGroups.map((group) => ({
    group,
    variant: getPromptVariant(group, alternateSeed),
  }));
  return shuffled([targetPromptVariant, ...distractorOptions]);
}

/** One shuffled pass over every word_group, each paired with an exercise type. */
function buildPass(groups: WordGroupWithVariants[], passIndex: number): ExerciseItem[] {
  const order = shuffled(groups);
  return order.map((group, i) => {
    const type = TYPE_CYCLE[(passIndex + i) % TYPE_CYCLE.length];
    const alternateSeed = passIndex + i;
    const promptVariant = getPromptVariant(group, alternateSeed);
    return {
      key: `${group.id}-${passIndex}-${i}`,
      type,
      targetGroup: group,
      promptVariant,
      options: buildOptions(group, { group, variant: promptVariant }, groups, alternateSeed),
    };
  });
}

export interface ExerciseQueue {
  currentExercise: ExerciseItem | null;
  /** Advances to the next exercise. The queue loops and reshuffles indefinitely for time-based sessions. */
  next: () => void;
}

/**
 * Produces an endless, reshuffled sequence of exercises over `groups` — the
 * session screen keeps pulling from this until its time goal elapses, so
 * there is no fixed "N exercises per lesson" concept here by design.
 */
export function useExerciseQueue(groups: WordGroupWithVariants[]): ExerciseQueue {
  const [queue, setQueue] = useState<ExerciseItem[]>(() =>
    groups.length > 0 ? buildPass(groups, 0) : []
  );
  const [index, setIndex] = useState(0);
  const nextPassIndexRef = useRef(1);

  useEffect(() => {
    setQueue(groups.length > 0 ? buildPass(groups, 0) : []);
    setIndex(0);
    nextPassIndexRef.current = 1;
  }, [groups]);

  useEffect(() => {
    if (groups.length === 0) return;
    // Keep at least one full pass buffered ahead of the current position.
    if (index >= queue.length - 2) {
      setQueue((prev) => [...prev, ...buildPass(groups, nextPassIndexRef.current)]);
      nextPassIndexRef.current += 1;
    }
  }, [index, queue.length, groups]);

  const next = useCallback(() => setIndex((prev) => prev + 1), []);

  return { currentExercise: queue[index] ?? null, next };
}
