export interface ReviewCandidate {
  wordGroupId: string;
  nextReviewAt: string; // ISO timestamp
  consecutiveIncorrect: number;
  correctCount: number;
}

/** Missed twice in a row counts as "struggling" — worth surfacing for
 * review even before its scheduled next_review_at, so a repeated mistake
 * doesn't have to wait out its full spaced-repetition interval before the
 * learner sees it again (see fetchReviewQueue in src/data/progress.ts,
 * which pulls these into the queue ahead of schedule). */
export const STRUGGLING_STREAK_THRESHOLD = 2;

export function isStruggling(candidate: Pick<ReviewCandidate, 'consecutiveIncorrect'>): boolean {
  return candidate.consecutiveIncorrect >= STRUGGLING_STREAK_THRESHOLD;
}

/**
 * Orders already-due review candidates by the product's stated priority:
 * most overdue first, then most-recently-struggled-with, then lowest
 * mastery. Callers are responsible for filtering to only strictly-due items
 * first (e.g. `next_review_at <= now`) — this function only orders them.
 */
export function sortReviewCandidates<T extends ReviewCandidate>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const overdueDiff = new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime();
    if (overdueDiff !== 0) return overdueDiff; // most overdue (oldest due date) first
    const incorrectDiff = b.consecutiveIncorrect - a.consecutiveIncorrect;
    if (incorrectDiff !== 0) return incorrectDiff; // recently-incorrect concepts next
    return a.correctCount - b.correctCount; // then lowest mastery
  });
}
