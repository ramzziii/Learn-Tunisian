import { calculateMasteryStatus, masteryLabel } from '@/lib/masteryStatus';

describe('calculateMasteryStatus', () => {
  it('is "new" for a word_group with zero correct answers', () => {
    expect(calculateMasteryStatus(0)).toBe('new');
  });

  it('is "learning" for 1-2 correct answers', () => {
    expect(calculateMasteryStatus(1)).toBe('learning');
    expect(calculateMasteryStatus(2)).toBe('learning');
  });

  it('is "known" (mastered) at exactly the threshold of 3 correct answers', () => {
    expect(calculateMasteryStatus(3)).toBe('known');
  });

  it('stays "known" for any count above the threshold', () => {
    expect(calculateMasteryStatus(10)).toBe('known');
  });

  it('treats a negative count the same as zero (defensive, should not occur in practice)', () => {
    expect(calculateMasteryStatus(-1)).toBe('new');
  });
});

describe('masteryLabel', () => {
  it('is "New" for zero correct answers', () => {
    expect(masteryLabel(0)).toBe('New');
  });

  it('is "Learning" for the first correct answer', () => {
    expect(masteryLabel(1)).toBe('Learning');
  });

  it('is "Almost there" one correct answer away from mastered', () => {
    expect(masteryLabel(2)).toBe('Almost there');
  });

  it('is "Mastered" at and above the mastery threshold', () => {
    expect(masteryLabel(3)).toBe('Mastered');
    expect(masteryLabel(10)).toBe('Mastered');
  });
});
