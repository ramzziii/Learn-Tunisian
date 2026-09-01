export interface ReviewCandidate {
  wordGroupId: string;
  nextReviewAt: string; // ISO timestamp
  consecutiveIncorrect: number;
  correctCount: number;
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
