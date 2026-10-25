/**
 * Repeat After Me session rules, as pure state transitions (the screen just
 * renders the state). Self-assessed: the learner says whether each attempt
 * was right.
 *
 * - Up to RAM_MAX_ATTEMPTS total attempts per item; marking one correct moves
 *   on immediately.
 * - Not correct after the last attempt → `notice: 'missed'` ("we'll revisit
 *   it later"), recorded as needs_review, and continue once acknowledged.
 * - After the items, each missed item gets exactly one more attempt in a
 *   review pass; then the session is done.
 * - Free plan: at most RAM_FREE_ITEMS_PER_SESSION distinct items. Before a
 *   sixth would start, the session stops at 'upgrade-gate'; continuing from
 *   there still runs the review pass for items already practiced.
 */

export const RAM_MAX_ATTEMPTS = 3;
export const RAM_FREE_ITEMS_PER_SESSION = 5;

export type RamResult = 'correct' | 'needs_review';

export interface RamItemResult {
  /** Total attempts this session, including the review pass. */
  attempts: number;
  result: RamResult;
}

export interface RamSavedItemProgress {
  attempts: number;
  lastResult: RamResult;
  lastPracticedAt: string;
}

export type RamPhase = 'practice' | 'upgrade-gate' | 'review' | 'done';

export interface RamSessionState<T extends { id: string }> {
  items: T[];
  isPremium: boolean;
  /** Items beyond what this session may practice (free plan only). */
  lockedCount: number;
  phase: RamPhase;
  /** Position in `items` (practice) or `missedIds` (review). */
  index: number;
  attemptsOnCurrent: number;
  notice: 'missed' | null;
  results: Record<string, RamItemResult>;
  missedIds: string[];
}

export function startSession<T extends { id: string }>(
  items: readonly T[],
  options: { isPremium: boolean; lockedCount: number }
): RamSessionState<T> {
  // Enforced here too, not only where items are loaded.
  const allowed = options.isPremium ? [...items] : items.slice(0, RAM_FREE_ITEMS_PER_SESSION);
  return {
    items: allowed,
    isPremium: options.isPremium,
    lockedCount: options.isPremium ? 0 : options.lockedCount + (items.length - allowed.length),
    phase: allowed.length > 0 ? 'practice' : 'done',
    index: 0,
    attemptsOnCurrent: 0,
    notice: null,
    results: {},
    missedIds: [],
  };
}

export function currentItem<T extends { id: string }>(state: RamSessionState<T>): T | null {
  if (state.phase === 'practice') return state.items[state.index] ?? null;
  if (state.phase === 'review') {
    const id = state.missedIds[state.index];
    return state.items.find((item) => item.id === id) ?? null;
  }
  return null;
}

function afterPractice<T extends { id: string }>(state: RamSessionState<T>): RamSessionState<T> {
  const base = { ...state, index: 0, attemptsOnCurrent: 0, notice: null };
  if (!state.isPremium && state.lockedCount > 0) return { ...base, phase: 'upgrade-gate' };
  return { ...base, phase: state.missedIds.length > 0 ? 'review' : 'done' };
}

function nextPracticeItem<T extends { id: string }>(state: RamSessionState<T>): RamSessionState<T> {
  const next = state.index + 1;
  if (next >= state.items.length) return afterPractice(state);
  return { ...state, index: next, attemptsOnCurrent: 0, notice: null };
}

export function assessAttempt<T extends { id: string }>(state: RamSessionState<T>, gotIt: boolean): RamSessionState<T> {
  const item = currentItem(state);
  if (!item || state.notice) return state;
  const previous = state.results[item.id];

  if (state.phase === 'review') {
    const results = {
      ...state.results,
      [item.id]: { attempts: (previous?.attempts ?? 0) + 1, result: gotIt ? ('correct' as const) : ('needs_review' as const) },
    };
    const next = state.index + 1;
    return next >= state.missedIds.length
      ? { ...state, results, phase: 'done', index: 0 }
      : { ...state, results, index: next };
  }

  const attempts = state.attemptsOnCurrent + 1;
  if (gotIt) {
    return nextPracticeItem({ ...state, results: { ...state.results, [item.id]: { attempts, result: 'correct' } } });
  }
  if (attempts >= RAM_MAX_ATTEMPTS) {
    return {
      ...state,
      attemptsOnCurrent: attempts,
      notice: 'missed',
      results: { ...state.results, [item.id]: { attempts, result: 'needs_review' } },
      missedIds: [...state.missedIds, item.id],
    };
  }
  return { ...state, attemptsOnCurrent: attempts };
}

/**
 * The shared practice flow finished the current item (it owns the attempts,
 * the result screens and the out-of-tries message): record the result and
 * move on. Not right → needs review, and queued for the end review pass.
 */
export function finishItem<T extends { id: string }>(
  state: RamSessionState<T>,
  result: { correct: boolean; attempts: number }
): RamSessionState<T> {
  const item = currentItem(state);
  if (!item) return state;
  const outcome: RamResult = result.correct ? 'correct' : 'needs_review';

  if (state.phase === 'review') {
    const previous = state.results[item.id];
    const results = { ...state.results, [item.id]: { attempts: (previous?.attempts ?? 0) + result.attempts, result: outcome } };
    const next = state.index + 1;
    return next >= state.missedIds.length ? { ...state, results, phase: 'done', index: 0 } : { ...state, results, index: next };
  }

  return nextPracticeItem({
    ...state,
    notice: null,
    results: { ...state.results, [item.id]: { attempts: result.attempts, result: outcome } },
    missedIds: result.correct ? state.missedIds : [...state.missedIds, item.id],
  });
}

/** Continues after the "we'll revisit this later" notice. */
export function advanceAfterNotice<T extends { id: string }>(state: RamSessionState<T>): RamSessionState<T> {
  if (state.notice !== 'missed') return state;
  return nextPracticeItem({ ...state, notice: null });
}

/** Leaves the free-plan upgrade screen: review what was missed, or finish. */
export function continueAfterUpgradeGate<T extends { id: string }>(state: RamSessionState<T>): RamSessionState<T> {
  if (state.phase !== 'upgrade-gate') return state;
  return { ...state, phase: state.missedIds.length > 0 ? 'review' : 'done', index: 0 };
}

/**
 * Items still needing work first (needs review, then never practiced), then
 * ones already marked correct — so a free learner's five per session move
 * through the content rather than repeating the same five. Stable otherwise.
 */
export function orderItemsForSession<T extends { id: string }>(
  items: readonly T[],
  progress: Readonly<Record<string, RamSavedItemProgress>>
): T[] {
  const rank = (id: string) => {
    const saved = progress[id];
    if (!saved) return 1;
    return saved.lastResult === 'needs_review' ? 0 : 2;
  };
  return items
    .map((item, position) => ({ item, position }))
    .sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.position - b.position)
    .map(({ item }) => item);
}
