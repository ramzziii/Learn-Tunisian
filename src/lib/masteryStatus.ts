import type { ProgressStatus } from '@/types/models';

const KNOWN_THRESHOLD = 3;

/** A word_group with zero correct answers is 'new'; 1-2 correct is 'learning'; 3+ is 'known' (mastered). */
export function calculateMasteryStatus(correctCount: number): ProgressStatus {
  if (correctCount <= 0) return 'new';
  return correctCount >= KNOWN_THRESHOLD ? 'known' : 'learning';
}
