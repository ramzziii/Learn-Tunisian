import { useCallback, useEffect, useRef, useState } from 'react';

import { buildListeningPass, interleaveListening } from '@/lib/listening';
import { getPromptVariant } from '@/lib/wordVariants';
import type { ExerciseItem, ExerciseOption, ExerciseType } from '@/types/exercises';
import type { FormPreference, WordGroupWithVariants } from '@/types/models';

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
  alternateSeed: number,
  form: FormPreference = 'both'
): ExerciseOption[] {
  const distractorGroups = shuffled(allGroups.filter((g) => g.id !== targetGroup.id)).slice(
    0,
    OPTION_COUNT - 1
  );
  const distractorOptions: ExerciseOption[] = distractorGroups.map((group) => ({
    group,
    variant: getPromptVariant(group, alternateSeed, form),
  }));
  return shuffled([targetPromptVariant, ...distractorOptions]);
}

/** One shuffled pass over every word_group, each paired with an exercise type. */
function buildPass(groups: WordGroupWithVariants[], passIndex: number, form: FormPreference): ExerciseItem[] {
  const order = shuffled(groups);
  return order.map((group, i) => {
    const type = TYPE_CYCLE[(passIndex + i) % TYPE_CYCLE.length];
    const alternateSeed = passIndex + i;
    // Two-form words lead with the learner's preferred form (display only).
    const promptVariant = getPromptVariant(group, alternateSeed, form);
    return {
      key: `${group.id}-${passIndex}-${i}`,
      type,
      targetGroup: group,
      promptVariant,
      options: buildOptions(group, { group, variant: promptVariant }, groups, alternateSeed, form),
    };
  });
}

/**
 * 'mixed' (lessons and review): the reading/typing/speaking rotation, with
 * one listening question after every 3 regular ones when the lesson has
 * native recordings (src/lib/listening.ts). 'listening': listening
 * questions only (standalone Listening practice).
 */
export type ExerciseMode = 'mixed' | 'listening';

const isListening = (item: ExerciseItem) => item.type === 'listen_recording' || item.type === 'listen_meaning';

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
export function useExerciseQueue(
  groups: WordGroupWithVariants[],
  mode: ExerciseMode = 'mixed',
  form: FormPreference = 'both'
): ExerciseQueue {
  // Read through a ref: changing the preference mid-session affects the
  // next passes without restarting the session.
  const formRef = useRef(form);
  formRef.current = form;
  // Running counts, so the "1 listening after every 3 regular" rhythm and
  // the format alternation carry across pass boundaries.
  const countsRef = useRef({ regularCount: 0, listeningCount: 0 });

  const makePass = useCallback(
    (passIndex: number): ExerciseItem[] => {
      if (groups.length === 0) return [];
      if (mode === 'listening') return buildListeningPass(groups, passIndex);
      const pass = interleaveListening(buildPass(groups, passIndex, formRef.current), groups, passIndex, countsRef.current);
      const listening = pass.filter(isListening).length;
      countsRef.current = {
        regularCount: countsRef.current.regularCount + pass.length - listening,
        listeningCount: countsRef.current.listeningCount + listening,
      };
      return pass;
    },
    [groups, mode]
  );

  const [queue, setQueue] = useState<ExerciseItem[]>(() => makePass(0));
  const [index, setIndex] = useState(0);
  const nextPassIndexRef = useRef(1);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // The initial pass was built by useState above; rebuild only when the
    // groups or mode actually change afterwards.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    countsRef.current = { regularCount: 0, listeningCount: 0 };
    setQueue(makePass(0));
    setIndex(0);
    nextPassIndexRef.current = 1;
  }, [makePass]);

  useEffect(() => {
    if (groups.length === 0 || queue.length === 0) return;
    // Keep at least one full pass buffered ahead of the current position.
    if (index >= queue.length - 2) {
      const pass = makePass(nextPassIndexRef.current);
      nextPassIndexRef.current += 1;
      if (pass.length > 0) setQueue((prev) => [...prev, ...pass]);
    }
  }, [index, queue.length, groups, makePass]);

  const next = useCallback(() => setIndex((prev) => prev + 1), []);

  return { currentExercise: queue[index] ?? null, next };
}
