import { buildDailyChallenges } from '@/lib/dailyChallenges';

const NONE_DONE = { minutesToday: 0, wordsPracticedToday: 0, reviewCompletedToday: false, speakingCompletedToday: false };

describe('buildDailyChallenges', () => {
  it('marks nothing complete with no activity today', () => {
    const challenges = buildDailyChallenges(NONE_DONE);
    expect(challenges.every((c) => !c.isComplete)).toBe(true);
    expect(challenges).toHaveLength(4);
  });

  it('completes the minutes challenge once the target is reached', () => {
    const challenges = buildDailyChallenges({ ...NONE_DONE, minutesToday: 3 });
    expect(challenges.find((c) => c.id === 'minutes')?.isComplete).toBe(true);
  });

  it('does not complete the minutes challenge just under the target', () => {
    const challenges = buildDailyChallenges({ ...NONE_DONE, minutesToday: 2 });
    expect(challenges.find((c) => c.id === 'minutes')?.isComplete).toBe(false);
  });

  it('completes the words challenge once the target is reached', () => {
    const challenges = buildDailyChallenges({ ...NONE_DONE, wordsPracticedToday: 5 });
    expect(challenges.find((c) => c.id === 'words')?.isComplete).toBe(true);
  });

  it('reflects the review and speaking flags directly', () => {
    const challenges = buildDailyChallenges({ ...NONE_DONE, reviewCompletedToday: true, speakingCompletedToday: true });
    expect(challenges.find((c) => c.id === 'review')?.isComplete).toBe(true);
    expect(challenges.find((c) => c.id === 'speaking')?.isComplete).toBe(true);
  });

  it('every challenge has a non-empty label and emoji', () => {
    for (const challenge of buildDailyChallenges(NONE_DONE)) {
      expect(challenge.label.length).toBeGreaterThan(0);
      expect(challenge.emoji.length).toBeGreaterThan(0);
    }
  });
});
