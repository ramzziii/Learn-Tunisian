// The learner's level for "Talk to a Tunisian" — derived automatically from
// existing progress data rather than a manual picker. wordsMastered is the
// primary signal (it reflects actual retained vocabulary); lessonsCompleted
// is a secondary nudge so a learner who's raced through several lessons
// isn't stuck at beginner just because few individual words have crossed
// the "known" threshold yet. Thresholds are a starting point, not tuned
// against real usage data — adjust here if levels feel mistimed in practice.

export type TalkLevel = 'beginner' | 'intermediate' | 'advanced';

const LEVEL_ORDER: TalkLevel[] = ['beginner', 'intermediate', 'advanced'];

export const TALK_LEVEL_THRESHOLDS = {
  intermediateWordsMastered: 15,
  advancedWordsMastered: 40,
  intermediateLessonsCompleted: 4,
  advancedLessonsCompleted: 10,
} as const;

export interface TalkLevelInputs {
  wordsMastered: number;
  lessonsCompleted: number;
}

export function calculateTalkLevel({ wordsMastered, lessonsCompleted }: TalkLevelInputs): TalkLevel {
  const isAdvanced =
    wordsMastered >= TALK_LEVEL_THRESHOLDS.advancedWordsMastered ||
    lessonsCompleted >= TALK_LEVEL_THRESHOLDS.advancedLessonsCompleted;
  if (isAdvanced) return 'advanced';

  const isIntermediate =
    wordsMastered >= TALK_LEVEL_THRESHOLDS.intermediateWordsMastered ||
    lessonsCompleted >= TALK_LEVEL_THRESHOLDS.intermediateLessonsCompleted;
  if (isIntermediate) return 'intermediate';

  return 'beginner';
}

/** True if a learner at `userLevel` can access content that requires `required`. */
export function meetsTalkLevel(userLevel: TalkLevel, required: TalkLevel): boolean {
  return LEVEL_ORDER.indexOf(userLevel) >= LEVEL_ORDER.indexOf(required);
}
