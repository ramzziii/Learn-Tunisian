import type { RepeatAfterMeItem } from '@/data/repeatAfterMe';
import { buildOptions } from '@/hooks/useExerciseQueue';
import { getPromptVariant } from '@/lib/wordVariants';
import type { ExerciseItem, ExerciseType } from '@/types/exercises';
import type { SessionType, WordGroupWithVariants } from '@/types/models';

/** Kept short on purpose — a daily nudge, not a full lesson. */
export const TODAYS_PRACTICE_LIMITS = { review: 5, newWords: 2, repeatAfterMe: 2 } as const;

const TYPE_CYCLE: ExerciseType[] = ['reading_match', 'typing_spelling', 'speaking'];
const NO_CHOICE_TYPE_CYCLE: ExerciseType[] = ['typing_spelling', 'speaking'];

export type TodaysPracticeStep =
  | { kind: 'word'; key: string; source: 'review' | 'new'; group: WordGroupWithVariants; exercise: ExerciseItem }
  | { kind: 'repeat'; key: string; item: RepeatAfterMeItem };

export interface TodaysPracticePlan {
  steps: TodaysPracticeStep[];
  /** True when a free learner's session includes review words — starting it
   * uses up today's free review, same as the Review screen. */
  usesFreeReview: boolean;
}

export interface TodaysPracticeInputs {
  /** Due review words, already in review-priority order (fetchReviewQueue). */
  reviewGroups: WordGroupWithVariants[];
  /** Not-yet-practiced words from an accessible current lesson. */
  newGroups: WordGroupWithVariants[];
  /** That lesson's words — extra distractors for multiple-choice questions. */
  lessonPool: WordGroupWithVariants[];
  /** Eligible Repeat After Me items, already free-capped by their loader. */
  repeatAfterMeItems: RepeatAfterMeItem[];
  isPremium: boolean;
  /** Free plan only: today's free review hasn't been used yet. */
  freeReviewAvailable: boolean;
}

function uniqueById<T extends { id: string }>(items: readonly T[], exclude: ReadonlySet<string>): T[] {
  const seen = new Set(exclude);
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * One short, predictable session: due review first, then a little new
 * practice, then Repeat After Me — each only if there's eligible content,
 * capped, and with no word appearing twice. Exercises use the same types
 * and option-building as lessons; types rotate deterministically.
 */
export function composeTodaysPractice(inputs: TodaysPracticeInputs): TodaysPracticePlan {
  const reviewAllowed = inputs.isPremium || inputs.freeReviewAvailable;
  const review = reviewAllowed
    ? uniqueById(inputs.reviewGroups, new Set()).slice(0, TODAYS_PRACTICE_LIMITS.review)
    : [];
  const newWords = uniqueById(inputs.newGroups, new Set(review.map((g) => g.id))).slice(0, TODAYS_PRACTICE_LIMITS.newWords);
  const words = [...review.map((group) => ({ group, source: 'review' as const })), ...newWords.map((group) => ({ group, source: 'new' as const }))];

  const wordIds = new Set(words.map((w) => w.group.id));
  const repeatItems = uniqueById(inputs.repeatAfterMeItems, new Set())
    .filter((item) => !wordIds.has(item.wordGroupId))
    .slice(0, TODAYS_PRACTICE_LIMITS.repeatAfterMe);

  const pool = uniqueById([...words.map((w) => w.group), ...inputs.lessonPool], new Set());
  const canOfferChoices = pool.length >= 2;

  const wordSteps: TodaysPracticeStep[] = words.map(({ group, source }, i) => {
    const key = `today-${source}-${group.id}`;
    const promptVariant = getPromptVariant(group, i);
    const cycle = canOfferChoices ? TYPE_CYCLE : NO_CHOICE_TYPE_CYCLE;
    const type = cycle[i % cycle.length];
    const exercise: ExerciseItem = {
      key,
      type,
      targetGroup: group,
      promptVariant,
      options:
        type === 'reading_match'
          ? buildOptions(group, { group, variant: promptVariant }, pool, i)
          : [],
    };
    return { kind: 'word', key, source, group, exercise };
  });

  return {
    steps: [...wordSteps, ...repeatItems.map((item) => ({ kind: 'repeat' as const, key: `today-repeat-${item.id}`, item }))],
    usesFreeReview: !inputs.isPremium && review.length > 0,
  };
}

/** Daily-goal minutes go through the existing session_logs (allowed types:
 * 'lesson' | 'review'), logged once per Today's Practice session. */
export function sessionLogTypeFor(plan: TodaysPracticePlan): SessionType {
  return plan.steps.some((s) => s.kind === 'word' && s.source === 'review') ? 'review' : 'lesson';
}
