import { calculateMasteryStatus } from '@/lib/masteryStatus';

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
