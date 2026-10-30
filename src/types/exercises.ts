import type { WordGroupWithVariants, WordVariant } from '@/types/models';

export type ExerciseType =
  | 'reading_match'
  | 'typing_spelling'
  | 'speaking'
  /** Listening quiz: see the meaning, choose the matching native recording. */
  | 'listen_recording'
  /** Listening quiz: hear a native recording, choose its meaning. */
  | 'listen_meaning';

/** One multiple-choice option: always a different word_group than the others — never two variants competing within the same group. */
export interface ExerciseOption {
  group: WordGroupWithVariants;
  variant: WordVariant;
}

/** One generated exercise: the target concept, which variant to prompt with, and (for choice exercises) the options. */
export interface ExerciseItem {
  key: string;
  type: ExerciseType;
  targetGroup: WordGroupWithVariants;
  promptVariant: WordVariant;
  options: ExerciseOption[];
  /** True for the end-of-session second pass over mispronounced words (see
   * src/lib/speakingRevisit.ts) — a miss there moves on without queueing the
   * word yet again. */
  isRevisit?: boolean;
}

/** Extra detail an exercise can report alongside correct/incorrect. */
export interface ExerciseOutcome {
  /** A speaking exercise the learner moved on from without saying it right
   * (chose "Keep going", or ran out of tries). The session host decides
   * whether to revisit it — see src/lib/speakingRevisit.ts. */
  mispronounced?: boolean;
}

export type ExerciseCompleteHandler = (wasCorrect: boolean, outcome?: ExerciseOutcome) => void;
