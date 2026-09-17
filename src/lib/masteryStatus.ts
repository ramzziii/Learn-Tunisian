import type { ProgressStatus } from '@/types/models';

const KNOWN_THRESHOLD = 3;

/** A word_group with zero correct answers is 'new'; 1-2 correct is 'learning'; 3+ is 'known' (mastered). */
export function calculateMasteryStatus(correctCount: number): ProgressStatus {
  if (correctCount <= 0) return 'new';
  return correctCount >= KNOWN_THRESHOLD ? 'known' : 'learning';
}

export type MasteryLabel = 'New' | 'Learning' | 'Almost there' | 'Mastered';

/**
 * A friendlier, finer-grained label than the stored ProgressStatus for
 * showing right after an exercise — splits 'learning' into "Learning" (just
 * started) vs "Almost there" (one correct answer away from mastered), which
 * the 3-value stored status doesn't distinguish but a learner very much
 * feels the difference between.
 */
export function masteryLabel(correctCount: number): MasteryLabel {
  const status = calculateMasteryStatus(correctCount);
  if (status === 'new') return 'New';
  if (status === 'known') return 'Mastered';
  return correctCount >= KNOWN_THRESHOLD - 1 ? 'Almost there' : 'Learning';
}
