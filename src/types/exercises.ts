import type { Word } from '@/types/models';

export type KidExerciseType = 'listen_and_tap';
export type AdultExerciseType = 'reading_match' | 'typing_spelling';
export type ExerciseType = KidExerciseType | AdultExerciseType;

/** One generated exercise: the target word plus any multiple-choice options (including the target). */
export interface ExerciseItem {
  key: string;
  type: ExerciseType;
  targetWord: Word;
  options: Word[];
}
