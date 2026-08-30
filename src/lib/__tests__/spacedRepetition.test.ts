import {
  calculateNextReview,
  INITIAL_SPACED_REPETITION_STATE,
  type SpacedRepetitionState,
} from '@/lib/spacedRepetition';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

describe('calculateNextReview', () => {
  it('schedules a 1-day review on the first-ever correct answer', () => {
    const result = calculateNextReview(INITIAL_SPACED_REPETITION_STATE, true, NOW);
    expect(result.reviewIntervalDays).toBe(1);
    expect(result.consecutiveCorrect).toBe(1);
    expect(result.consecutiveIncorrect).toBe(0);
    expect(daysBetween(NOW, result.nextReviewAt)).toBe(1);
  });

  it('schedules a 6-day review on the second consecutive correct answer', () => {
    const first = calculateNextReview(INITIAL_SPACED_REPETITION_STATE, true, NOW);
    const second = calculateNextReview(first, true, NOW);
    expect(second.reviewIntervalDays).toBe(6);
    expect(second.consecutiveCorrect).toBe(2);
  });

  it('grows the interval by the ease factor from the third consecutive correct answer onward', () => {
    let state: SpacedRepetitionState = INITIAL_SPACED_REPETITION_STATE;
    state = calculateNextReview(state, true, NOW); // 1 day, ease 2.6
    state = calculateNextReview(state, true, NOW); // 6 days, ease 2.7
    const third = calculateNextReview(state, true, NOW);
    expect(third.reviewIntervalDays).toBe(Math.round(6 * state.easeFactor));
    expect(third.consecutiveCorrect).toBe(3);
  });

  it('increases the ease factor by a small fixed amount on each correct answer', () => {
    const result = calculateNextReview(INITIAL_SPACED_REPETITION_STATE, true, NOW);
    expect(result.easeFactor).toBeCloseTo(2.6, 5);
  });

  it('caps the ease factor so intervals cannot grow unboundedly', () => {
    let state: SpacedRepetitionState = { ...INITIAL_SPACED_REPETITION_STATE, easeFactor: 2.95 };
    state = calculateNextReview(state, true, NOW);
    state = calculateNextReview(state, true, NOW);
    expect(state.easeFactor).toBeLessThanOrEqual(3.0);
  });

  it('resets to a 1-day interval and zeroes consecutive correct on an incorrect answer', () => {
    let state: SpacedRepetitionState = INITIAL_SPACED_REPETITION_STATE;
    state = calculateNextReview(state, true, NOW);
    state = calculateNextReview(state, true, NOW);
    state = calculateNextReview(state, true, NOW); // built up a longer interval

    const lapsed = calculateNextReview(state, false, NOW);
    expect(lapsed.reviewIntervalDays).toBe(1);
    expect(lapsed.consecutiveCorrect).toBe(0);
    expect(lapsed.consecutiveIncorrect).toBe(1);
    expect(daysBetween(NOW, lapsed.nextReviewAt)).toBe(1);
  });

  it('decreases the ease factor on an incorrect answer', () => {
    const result = calculateNextReview(INITIAL_SPACED_REPETITION_STATE, false, NOW);
    expect(result.easeFactor).toBeCloseTo(2.3, 5);
  });

  it('floors the ease factor so it cannot drop below the minimum after repeated lapses', () => {
    let state: SpacedRepetitionState = INITIAL_SPACED_REPETITION_STATE;
    for (let i = 0; i < 20; i++) {
      state = calculateNextReview(state, false, NOW);
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
    expect(state.easeFactor).toBeCloseTo(1.3, 5);
  });

  it('accumulates consecutive incorrect answers across repeated lapses', () => {
    let state: SpacedRepetitionState = INITIAL_SPACED_REPETITION_STATE;
    state = calculateNextReview(state, false, NOW);
    state = calculateNextReview(state, false, NOW);
    const third = calculateNextReview(state, false, NOW);
    expect(third.consecutiveIncorrect).toBe(3);
  });

  it('restarts the 1-day/6-day progression after a lapse rather than resuming the old interval', () => {
    let state: SpacedRepetitionState = INITIAL_SPACED_REPETITION_STATE;
    state = calculateNextReview(state, true, NOW);
    state = calculateNextReview(state, true, NOW);
    state = calculateNextReview(state, true, NOW); // interval now well beyond 6 days
    state = calculateNextReview(state, false, NOW); // lapse

    const recovered = calculateNextReview(state, true, NOW);
    expect(recovered.reviewIntervalDays).toBe(1);
    expect(recovered.consecutiveCorrect).toBe(1);
  });
});
