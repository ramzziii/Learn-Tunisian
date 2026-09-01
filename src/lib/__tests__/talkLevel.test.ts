import { calculateTalkLevel, meetsTalkLevel } from '@/lib/talkLevel';

describe('calculateTalkLevel', () => {
  it('is beginner with little progress', () => {
    expect(calculateTalkLevel({ wordsMastered: 0, lessonsCompleted: 0 })).toBe('beginner');
    expect(calculateTalkLevel({ wordsMastered: 5, lessonsCompleted: 1 })).toBe('beginner');
  });

  it('reaches intermediate via wordsMastered', () => {
    expect(calculateTalkLevel({ wordsMastered: 15, lessonsCompleted: 0 })).toBe('intermediate');
  });

  it('reaches intermediate via lessonsCompleted even with few mastered words', () => {
    expect(calculateTalkLevel({ wordsMastered: 2, lessonsCompleted: 4 })).toBe('intermediate');
  });

  it('reaches advanced via wordsMastered', () => {
    expect(calculateTalkLevel({ wordsMastered: 40, lessonsCompleted: 0 })).toBe('advanced');
  });

  it('reaches advanced via lessonsCompleted even with few mastered words', () => {
    expect(calculateTalkLevel({ wordsMastered: 3, lessonsCompleted: 10 })).toBe('advanced');
  });

  it('is never negative or undefined for zero progress', () => {
    expect(calculateTalkLevel({ wordsMastered: 0, lessonsCompleted: 0 })).toBe('beginner');
  });
});

describe('meetsTalkLevel', () => {
  it('a level always meets its own requirement', () => {
    expect(meetsTalkLevel('beginner', 'beginner')).toBe(true);
    expect(meetsTalkLevel('intermediate', 'intermediate')).toBe(true);
    expect(meetsTalkLevel('advanced', 'advanced')).toBe(true);
  });

  it('a higher level meets a lower requirement', () => {
    expect(meetsTalkLevel('advanced', 'beginner')).toBe(true);
    expect(meetsTalkLevel('intermediate', 'beginner')).toBe(true);
  });

  it('a lower level does not meet a higher requirement', () => {
    expect(meetsTalkLevel('beginner', 'intermediate')).toBe(false);
    expect(meetsTalkLevel('intermediate', 'advanced')).toBe(false);
  });
});
