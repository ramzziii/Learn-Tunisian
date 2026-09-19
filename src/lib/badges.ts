export interface BadgeStats {
  totalWordsSeen: number;
  wordsMastered: number;
  wordsReviewed: number;
  lessonsCompleted: number;
  lettersPracticed: number;
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  earned: boolean;
}

interface BadgeDefinition {
  id: string;
  emoji: string;
  title: string;
  isEarned: (stats: BadgeStats) => boolean;
}

const TOTAL_ALPHABET_LETTERS = 28;

/**
 * A small, fixed catalog of cumulative kid milestones — every threshold is
 * monotonic (words seen, lessons completed, letters practiced only ever go
 * up), so a badge, once earned, can never be "lost." Deliberately not
 * stored anywhere of its own: earned/not-earned is recomputed live from
 * progress data the app already tracks, the same "derive, don't store"
 * approach src/lib/dailyChallenges.ts uses. src/lib/badgeProgress.ts
 * separately remembers which of these a profile has already been
 * celebrated for, so the "new badge!" moment only shows once.
 */
const BADGE_CATALOG: BadgeDefinition[] = [
  { id: 'first_word', emoji: '🌱', title: 'First Word', isEarned: (s) => s.totalWordsSeen >= 1 },
  { id: 'word_explorer', emoji: '🗺️', title: 'Word Explorer', isEarned: (s) => s.totalWordsSeen >= 10 },
  { id: 'word_wizard', emoji: '🧙', title: 'Word Wizard', isEarned: (s) => s.wordsMastered >= 10 },
  { id: 'lesson_champ', emoji: '🏆', title: 'Lesson Champ', isEarned: (s) => s.lessonsCompleted >= 1 },
  { id: 'super_learner', emoji: '🚀', title: 'Super Learner', isEarned: (s) => s.lessonsCompleted >= 3 },
  { id: 'letter_learner', emoji: '🔤', title: 'Letter Learner', isEarned: (s) => s.lettersPracticed >= 5 },
  {
    id: 'alphabet_star',
    emoji: '⭐',
    title: 'Alphabet Star',
    isEarned: (s) => s.lettersPracticed >= TOTAL_ALPHABET_LETTERS,
  },
  { id: 'review_rockstar', emoji: '🔄', title: 'Review Rockstar', isEarned: (s) => s.wordsReviewed >= 5 },
];

export function evaluateBadges(stats: BadgeStats): Badge[] {
  return BADGE_CATALOG.map(({ id, emoji, title, isEarned }) => ({ id, emoji, title, earned: isEarned(stats) }));
}
