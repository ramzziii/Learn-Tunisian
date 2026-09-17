export interface DailyChallengeContext {
  minutesToday: number;
  wordsPracticedToday: number;
  reviewCompletedToday: boolean;
  speakingCompletedToday: boolean;
}

export interface DailyChallenge {
  id: string;
  label: string;
  emoji: string;
  isComplete: boolean;
}

const MINUTES_TARGET = 3;
const WORDS_TARGET = 5;

/**
 * Small, fixed daily challenges — deliberately not stored anywhere of their
 * own; each is derived from data the app already tracks (today's minutes
 * and words-practiced come straight from HomeData; review/speaking use the
 * local flags in dailyChallengeProgress.ts). Always exactly these three, in
 * this order, so the list itself never needs configuration.
 */
export function buildDailyChallenges(context: DailyChallengeContext): DailyChallenge[] {
  return [
    {
      id: 'minutes',
      label: `Learn for ${MINUTES_TARGET} minutes`,
      emoji: '⏱️',
      isComplete: context.minutesToday >= MINUTES_TARGET,
    },
    {
      id: 'words',
      label: `Practice ${WORDS_TARGET} words`,
      emoji: '📚',
      isComplete: context.wordsPracticedToday >= WORDS_TARGET,
    },
    {
      id: 'review',
      label: 'Finish a weak-word review',
      emoji: '🔄',
      isComplete: context.reviewCompletedToday,
    },
    {
      id: 'speaking',
      label: 'Say 3 phrases out loud',
      emoji: '🎙️',
      isComplete: context.speakingCompletedToday,
    },
  ];
}
