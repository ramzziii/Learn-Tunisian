// Today's Practice composition (pure): review first, a little new practice,
// then Repeat After Me — capped, de-duplicated, predictable, and respecting
// the free plan's review allowance.
import {
  composeTodaysPractice,
  sessionLogTypeFor,
  TODAYS_PRACTICE_LIMITS,
  type TodaysPracticeInputs,
} from '@/lib/todaysPractice';
import type { RepeatAfterMeItem } from '@/data/repeatAfterMe';
import type { WordGroupWithVariants } from '@/types/models';

const group = (id: string) =>
  ({
    id,
    englishMeaning: id,
    variants: [{ id: `${id}-v`, variantLabel: 'primary', wordArabic: 'كلمة', transliteration: id }],
  }) as unknown as WordGroupWithVariants;

const ram = (id: string, wordGroupId = `ram-group-${id}`) =>
  ({
    id,
    wordGroupId,
    englishMeaning: id,
    variant: { id, wordArabic: 'كلمة', transliteration: id, audioPath: `${wordGroupId}/${id}.m4a` },
  }) as unknown as RepeatAfterMeItem;

const inputs = (overrides: Partial<TodaysPracticeInputs> = {}): TodaysPracticeInputs => ({
  reviewGroups: [],
  newGroups: [],
  lessonPool: [],
  repeatAfterMeItems: [],
  isPremium: true,
  freeReviewAvailable: true,
  ...overrides,
});

const ids = (plan: ReturnType<typeof composeTodaysPractice>) =>
  plan.steps.map((s) => (s.kind === 'word' ? `${s.source}:${s.group.id}` : `repeat:${s.item.id}`));

it('keeps it short: up to 5 review, 2 new, 2 Repeat After Me', () => {
  expect(TODAYS_PRACTICE_LIMITS).toEqual({ review: 5, newWords: 2, repeatAfterMe: 2 });
});

describe('composition and order', () => {
  it('due review first (in queue order), then new words, then Repeat After Me', () => {
    const plan = composeTodaysPractice(
      inputs({
        reviewGroups: [group('r1'), group('r2')],
        newGroups: [group('n1')],
        repeatAfterMeItems: [ram('a1')],
      })
    );
    expect(ids(plan)).toEqual(['review:r1', 'review:r2', 'new:n1', 'repeat:a1']);
  });

  it('caps each part', () => {
    const plan = composeTodaysPractice(
      inputs({
        reviewGroups: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'].map(group),
        newGroups: ['n1', 'n2', 'n3'].map(group),
        repeatAfterMeItems: [ram('a1'), ram('a2'), ram('a3')],
      })
    );
    expect(ids(plan)).toEqual([
      'review:r1', 'review:r2', 'review:r3', 'review:r4', 'review:r5',
      'new:n1', 'new:n2',
      'repeat:a1', 'repeat:a2',
    ]);
  });

  it('is predictable — same inputs, same session', () => {
    const make = () =>
      composeTodaysPractice(inputs({ reviewGroups: [group('r1'), group('r2')], newGroups: [group('n1')] }));
    expect(ids(make())).toEqual(ids(make()));
    expect(make().steps.map((s) => (s.kind === 'word' ? s.exercise.type : 'repeat'))).toEqual(
      make().steps.map((s) => (s.kind === 'word' ? s.exercise.type : 'repeat'))
    );
  });
});

describe('partial and empty content', () => {
  it('nothing available → an empty plan (the screen shows an empty state, not a broken session)', () => {
    expect(composeTodaysPractice(inputs()).steps).toEqual([]);
  });

  it('only new words → just new practice (no activity type is forced)', () => {
    expect(ids(composeTodaysPractice(inputs({ newGroups: [group('n1')] })))).toEqual(['new:n1']);
  });

  it('only Repeat After Me → just that', () => {
    expect(ids(composeTodaysPractice(inputs({ repeatAfterMeItems: [ram('a1')] })))).toEqual(['repeat:a1']);
  });
});

describe('no duplicates within a session', () => {
  it('a word due for review is not also offered as new, and repeats in a source are dropped', () => {
    const plan = composeTodaysPractice(
      inputs({ reviewGroups: [group('w1'), group('w1')], newGroups: [group('w1'), group('n2')] })
    );
    expect(ids(plan)).toEqual(['review:w1', 'new:n2']);
  });

  it('Repeat After Me skips a recording whose word is already in the session', () => {
    const plan = composeTodaysPractice(
      inputs({ reviewGroups: [group('w1')], repeatAfterMeItems: [ram('a1', 'w1'), ram('a2'), ram('a2')] })
    );
    expect(ids(plan)).toEqual(['review:w1', 'repeat:a2']);
  });

  it('every step has a unique key', () => {
    const plan = composeTodaysPractice(
      inputs({ reviewGroups: [group('r1'), group('r2')], newGroups: [group('n1')], repeatAfterMeItems: [ram('a1')] })
    );
    expect(new Set(plan.steps.map((s) => s.key)).size).toBe(plan.steps.length);
  });
});

describe('free vs Premium', () => {
  it('free with today’s free review still available: review included, and the plan says it uses that allowance', () => {
    const plan = composeTodaysPractice(inputs({ isPremium: false, reviewGroups: [group('r1')] }));
    expect(ids(plan)).toEqual(['review:r1']);
    expect(plan.usesFreeReview).toBe(true);
  });

  it('free who already used today’s review: no review words (the daily limit is not bypassed)', () => {
    const plan = composeTodaysPractice(
      inputs({ isPremium: false, freeReviewAvailable: false, reviewGroups: [group('r1')], newGroups: [group('n1')] })
    );
    expect(ids(plan)).toEqual(['new:n1']);
    expect(plan.usesFreeReview).toBe(false);
  });

  it('Premium never consumes a free allowance', () => {
    expect(composeTodaysPractice(inputs({ reviewGroups: [group('r1')] })).usesFreeReview).toBe(false);
  });
});

describe('exercises for word steps', () => {
  it('each word step is a real exercise for that word, using existing exercise types', () => {
    const plan = composeTodaysPractice(
      inputs({
        reviewGroups: [group('r1'), group('r2'), group('r3')],
        lessonPool: ['p1', 'p2', 'p3', 'p4'].map(group),
      })
    );
    for (const step of plan.steps) {
      if (step.kind !== 'word') continue;
      expect(step.exercise.targetGroup.id).toBe(step.group.id);
      expect(['reading_match', 'typing_spelling', 'speaking']).toContain(step.exercise.type);
    }
  });

  it('a choice exercise always contains the right answer once, with other words as distractors', () => {
    const plan = composeTodaysPractice(inputs({ reviewGroups: [group('r1')], lessonPool: ['p1', 'p2', 'p3'].map(group) }));
    const step = plan.steps[0];
    if (step.kind !== 'word' || step.exercise.type !== 'reading_match') throw new Error('expected a reading_match');
    const optionIds = step.exercise.options.map((o) => o.group.id);
    expect(optionIds.filter((id) => id === 'r1')).toHaveLength(1);
    expect(new Set(optionIds).size).toBe(optionIds.length);
  });

  it('with too few words for multiple choice, uses an exercise that needs no distractors', () => {
    const plan = composeTodaysPractice(inputs({ reviewGroups: [group('r1')] }));
    const step = plan.steps[0];
    expect(step.kind === 'word' && step.exercise.type).not.toBe('reading_match');
  });
});

describe('sessionLogTypeFor (daily goal minutes are logged once, as an existing session type)', () => {
  it("'review' when the session included review words, otherwise 'lesson'", () => {
    expect(sessionLogTypeFor(composeTodaysPractice(inputs({ reviewGroups: [group('r1')] })))).toBe('review');
    expect(sessionLogTypeFor(composeTodaysPractice(inputs({ newGroups: [group('n1')] })))).toBe('lesson');
  });
});
