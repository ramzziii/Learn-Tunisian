import { countCompletedLessons } from '@/data/content';
import { fetchProgressSummary } from '@/data/progress';
import { getAlphabetProgress } from '@/lib/alphabetProgress';
import type { BadgeStats } from '@/lib/badges';

/**
 * Assembles the inputs src/lib/badges.ts needs to evaluate the kid badge
 * catalog — every field comes from a query the app already makes elsewhere
 * (Home's progress summary, Settings' lesson count, the alphabet library's
 * local progress); this just combines them, no new Supabase query.
 */
export async function fetchBadgeStats(profileId: string): Promise<BadgeStats> {
  const [progressSummary, lessonsCompleted, alphabetProgress] = await Promise.all([
    fetchProgressSummary(profileId),
    countCompletedLessons(profileId),
    getAlphabetProgress(profileId),
  ]);

  return {
    totalWordsSeen: progressSummary.totalWordsSeen,
    wordsMastered: progressSummary.wordsMastered,
    wordsReviewed: progressSummary.wordsReviewed,
    lessonsCompleted,
    lettersPracticed: alphabetProgress.practicedLetterIds.length,
  };
}
