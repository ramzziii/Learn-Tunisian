import type { WordGroupWithVariants, WordVariant } from '@/types/models';

export type KidExerciseType = 'listen_and_tap';
export type AdultExerciseType = 'reading_match' | 'typing_spelling';
export type ExerciseType = KidExerciseType | AdultExerciseType;

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
}
