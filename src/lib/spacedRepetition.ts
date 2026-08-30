// A deliberately simple spaced-repetition schedule (a lightweight SM-2),
// not a full SuperMemo implementation — enough to prioritize what a learner
// actually needs to review without over-engineering the algorithm.

export interface SpacedRepetitionState {
  reviewIntervalDays: number;
  easeFactor: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
}

export interface SpacedRepetitionResult extends SpacedRepetitionState {
  nextReviewAt: Date;
}

/** State for a word_group with no prior review history (its first-ever attempt). */
export const INITIAL_SPACED_REPETITION_STATE: SpacedRepetitionState = {
  reviewIntervalDays: 0,
  easeFactor: 2.5,
  consecutiveCorrect: 0,
  consecutiveIncorrect: 0,
};

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0; // caps how far apart reviews can drift, even for a concept answered correctly for months
const EASE_FACTOR_INCREMENT = 0.1;
const EASE_FACTOR_PENALTY = 0.2;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;
const LAPSE_INTERVAL_DAYS = 1;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Given a word_group's current spaced-repetition state and whether the
 * latest attempt was correct, returns the next state and when it's next
 * due for review.
 *
 * - Correct: interval progresses 1 day -> 6 days -> (previous interval *
 *   ease factor) for each consecutive correct answer; ease factor nudges
 *   up slightly (capped) each time.
 * - Incorrect ("a lapse"): resets to a 1-day interval and consecutive
 *   correct count, and nudges the ease factor down (floored) so a concept
 *   that's proving difficult gets reviewed more often going forward.
 */
export function calculateNextReview(
  current: SpacedRepetitionState,
  wasCorrect: boolean,
  now: Date = new Date()
): SpacedRepetitionResult {
  if (!wasCorrect) {
    const easeFactor = Math.max(MIN_EASE_FACTOR, current.easeFactor - EASE_FACTOR_PENALTY);
    return {
      reviewIntervalDays: LAPSE_INTERVAL_DAYS,
      easeFactor,
      consecutiveCorrect: 0,
      consecutiveIncorrect: current.consecutiveIncorrect + 1,
      nextReviewAt: addDays(now, LAPSE_INTERVAL_DAYS),
    };
  }

  const consecutiveCorrect = current.consecutiveCorrect + 1;
  const reviewIntervalDays =
    consecutiveCorrect === 1
      ? FIRST_INTERVAL_DAYS
      : consecutiveCorrect === 2
        ? SECOND_INTERVAL_DAYS
        : Math.round(current.reviewIntervalDays * current.easeFactor);

  const easeFactor = Math.min(MAX_EASE_FACTOR, current.easeFactor + EASE_FACTOR_INCREMENT);

  return {
    reviewIntervalDays,
    easeFactor,
    consecutiveCorrect,
    consecutiveIncorrect: 0,
    nextReviewAt: addDays(now, reviewIntervalDays),
  };
}
