import { evaluateBadges, type BadgeStats } from '@/lib/badges';

const NONE: BadgeStats = {
  totalWordsSeen: 0,
  wordsMastered: 0,
  wordsReviewed: 0,
  lessonsCompleted: 0,
  lettersPracticed: 0,
};

describe('evaluateBadges', () => {
  it('earns nothing with no activity', () => {
    const badges = evaluateBadges(NONE);
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  it('earns the first-word badge once a word has been seen', () => {
    const badges = evaluateBadges({ ...NONE, totalWordsSeen: 1 });
    expect(badges.find((b) => b.id === 'first_word')?.earned).toBe(true);
  });

  it('does not earn word-explorer just under its threshold', () => {
    const badges = evaluateBadges({ ...NONE, totalWordsSeen: 9 });
    expect(badges.find((b) => b.id === 'word_explorer')?.earned).toBe(false);
  });

  it('earns word-explorer at its threshold', () => {
    const badges = evaluateBadges({ ...NONE, totalWordsSeen: 10 });
    expect(badges.find((b) => b.id === 'word_explorer')?.earned).toBe(true);
  });

  it('earns lesson-based badges from lessonsCompleted', () => {
    const badges = evaluateBadges({ ...NONE, lessonsCompleted: 3 });
    expect(badges.find((b) => b.id === 'lesson_champ')?.earned).toBe(true);
    expect(badges.find((b) => b.id === 'super_learner')?.earned).toBe(true);
  });

  it('only earns alphabet-star once all 28 letters are practiced', () => {
    expect(evaluateBadges({ ...NONE, lettersPracticed: 27 }).find((b) => b.id === 'alphabet_star')?.earned).toBe(
      false
    );
    expect(evaluateBadges({ ...NONE, lettersPracticed: 28 }).find((b) => b.id === 'alphabet_star')?.earned).toBe(
      true
    );
  });

  it('every badge has a non-empty title and emoji', () => {
    for (const badge of evaluateBadges(NONE)) {
      expect(badge.title.length).toBeGreaterThan(0);
      expect(badge.emoji.length).toBeGreaterThan(0);
    }
  });

  it('badge ids are unique', () => {
    const ids = evaluateBadges(NONE).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
