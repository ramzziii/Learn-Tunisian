// Repeat After Me session rules (pure): three total attempts per item, early
// success, missed items revisited once in an end review pass, and the free
// plan's five-distinct-items-per-session limit.
import {
  advanceAfterNotice,
  assessAttempt,
  finishItem,
  continueAfterUpgradeGate,
  currentItem,
  orderItemsForSession,
  RAM_FREE_ITEMS_PER_SESSION,
  RAM_MAX_ATTEMPTS,
  startSession,
} from '@/lib/repeatAfterMe/session';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `item-${i + 1}` }));

describe('limits', () => {
  it('three total attempts per item; five distinct items per free session', () => {
    expect(RAM_MAX_ATTEMPTS).toBe(3);
    expect(RAM_FREE_ITEMS_PER_SESSION).toBe(5);
  });
});

describe('attempts on one item', () => {
  it('marking an attempt correct moves straight on (early success)', () => {
    let s = startSession(items(2), { isPremium: true, lockedCount: 0 });
    s = assessAttempt(s, true);
    expect(currentItem(s)?.id).toBe('item-2');
    expect(s.results['item-1']).toEqual({ attempts: 1, result: 'correct' });
  });

  it('a "not yet" keeps the same item and counts the attempt', () => {
    let s = startSession(items(2), { isPremium: true, lockedCount: 0 });
    s = assessAttempt(s, false);
    expect(currentItem(s)?.id).toBe('item-1');
    expect(s.attemptsOnCurrent).toBe(1);
    expect(s.notice).toBeNull();
  });

  it('correct on the third attempt still counts as correct', () => {
    let s = startSession(items(1), { isPremium: true, lockedCount: 0 });
    s = assessAttempt(s, false);
    s = assessAttempt(s, false);
    s = assessAttempt(s, true);
    expect(s.results['item-1']).toEqual({ attempts: 3, result: 'correct' });
    expect(s.missedIds).toEqual([]);
  });

  it('three "not yet": tells them it will be revisited, records it missed, then continues', () => {
    let s = startSession(items(2), { isPremium: true, lockedCount: 0 });
    for (let i = 0; i < RAM_MAX_ATTEMPTS; i++) s = assessAttempt(s, false);

    expect(s.notice).toBe('missed');
    expect(s.results['item-1']).toEqual({ attempts: 3, result: 'needs_review' });
    expect(s.missedIds).toEqual(['item-1']);
    // Never a fourth attempt on the same item.
    expect(assessAttempt(s, false)).toBe(s);

    s = advanceAfterNotice(s);
    expect(s.notice).toBeNull();
    expect(currentItem(s)?.id).toBe('item-2');
    expect(s.attemptsOnCurrent).toBe(0);
  });
});

describe('end review pass', () => {
  function missFirstOfThree() {
    let s = startSession(items(3), { isPremium: true, lockedCount: 0 });
    for (let i = 0; i < RAM_MAX_ATTEMPTS; i++) s = assessAttempt(s, false);
    s = advanceAfterNotice(s);
    s = assessAttempt(s, true); // item-2
    s = assessAttempt(s, true); // item-3
    return s;
  }

  it('after all items, each missed item gets exactly one more attempt', () => {
    const s = missFirstOfThree();
    expect(s.phase).toBe('review');
    expect(currentItem(s)?.id).toBe('item-1');
  });

  it('getting it right in review updates the result; the session then finishes', () => {
    let s = missFirstOfThree();
    s = assessAttempt(s, true);
    expect(s.results['item-1']).toEqual({ attempts: 4, result: 'correct' });
    expect(s.phase).toBe('done');
  });

  it('missing it in review leaves it needing review — no second review pass', () => {
    let s = missFirstOfThree();
    s = assessAttempt(s, false);
    expect(s.results['item-1']).toEqual({ attempts: 4, result: 'needs_review' });
    expect(s.phase).toBe('done');
  });

  it('no missed items → finishes without a review pass', () => {
    let s = startSession(items(2), { isPremium: true, lockedCount: 0 });
    s = assessAttempt(s, true);
    s = assessAttempt(s, true);
    expect(s.phase).toBe('done');
  });
});

describe('free plan: five distinct items per session', () => {
  it('a free session never holds more than five items, whatever it is given', () => {
    const s = startSession(items(8), { isPremium: false, lockedCount: 0 });
    expect(s.items.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3', 'item-4', 'item-5']);
    expect(s.lockedCount).toBe(3);
  });

  it('shows the upgrade gate before a sixth item would start', () => {
    let s = startSession(items(5), { isPremium: false, lockedCount: 4 });
    for (let i = 0; i < 5; i++) s = assessAttempt(s, true);
    expect(s.phase).toBe('upgrade-gate');
    expect(currentItem(s)).toBeNull();
  });

  it('the limit does not block reviewing items already practiced this session', () => {
    let s = startSession(items(5), { isPremium: false, lockedCount: 4 });
    for (let i = 0; i < RAM_MAX_ATTEMPTS; i++) s = assessAttempt(s, false);
    s = advanceAfterNotice(s);
    for (let i = 0; i < 4; i++) s = assessAttempt(s, true);
    expect(s.phase).toBe('upgrade-gate');

    s = continueAfterUpgradeGate(s);
    expect(s.phase).toBe('review');
    expect(currentItem(s)?.id).toBe('item-1');
    s = assessAttempt(s, true);
    expect(s.phase).toBe('done');
  });

  it('no gate when everything available fit in the session', () => {
    let s = startSession(items(3), { isPremium: false, lockedCount: 0 });
    for (let i = 0; i < 3; i++) s = assessAttempt(s, true);
    expect(s.phase).toBe('done');
  });

  it('Premium gets every item, no gate', () => {
    let s = startSession(items(8), { isPremium: true, lockedCount: 0 });
    expect(s.items).toHaveLength(8);
    for (let i = 0; i < 8; i++) s = assessAttempt(s, true);
    expect(s.phase).toBe('done');
  });
});

describe('orderItemsForSession', () => {
  it('puts items not yet marked correct first (needs review, then never practiced), keeping stable order', () => {
    const ordered = orderItemsForSession(items(4), {
      'item-1': { attempts: 1, lastResult: 'correct', lastPracticedAt: '2026-10-01T00:00:00Z' },
      'item-3': { attempts: 3, lastResult: 'needs_review', lastPracticedAt: '2026-10-01T00:00:00Z' },
    });
    expect(ordered.map((i) => i.id)).toEqual(['item-3', 'item-2', 'item-4', 'item-1']);
  });
});

describe('finishItem (the shared practice flow reports a finished item)', () => {
  it('said right → correct with its attempt count, next item', () => {
    let s = startSession(items(2), { isPremium: true, lockedCount: 0 });
    s = finishItem(s, { correct: true, attempts: 2 });
    expect(s.results['item-1']).toEqual({ attempts: 2, result: 'correct' });
    expect(currentItem(s)?.id).toBe('item-2');
  });

  it('moved on (or out of tries) → needs review, queued for the end review pass, next item', () => {
    let s = startSession(items(2), { isPremium: true, lockedCount: 0 });
    s = finishItem(s, { correct: false, attempts: 1 });
    expect(s.results['item-1']).toEqual({ attempts: 1, result: 'needs_review' });
    expect(s.missedIds).toEqual(['item-1']);
    expect(s.notice).toBeNull();
    expect(currentItem(s)?.id).toBe('item-2');
  });

  it('the review pass adds its attempt and finishes', () => {
    let s = startSession(items(1), { isPremium: true, lockedCount: 0 });
    s = finishItem(s, { correct: false, attempts: 3 });
    expect(s.phase).toBe('review');
    s = finishItem(s, { correct: true, attempts: 1 });
    expect(s.results['item-1']).toEqual({ attempts: 4, result: 'correct' });
    expect(s.phase).toBe('done');
  });

  it('free: still stops at the upgrade gate after five, then reviews what was missed', () => {
    let s = startSession(items(5), { isPremium: false, lockedCount: 2 });
    s = finishItem(s, { correct: false, attempts: 3 });
    for (let i = 0; i < 4; i++) s = finishItem(s, { correct: true, attempts: 1 });
    expect(s.phase).toBe('upgrade-gate');
    s = continueAfterUpgradeGate(s);
    expect(currentItem(s)?.id).toBe('item-1');
  });
});
