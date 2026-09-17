import { calculateStreak } from '@/lib/streak';

describe('calculateStreak', () => {
  it('counts consecutive days ending today', () => {
    const today = new Date('2026-03-10T12:00:00');
    expect(calculateStreak(['2026-03-08', '2026-03-09', '2026-03-10'], today)).toBe(3);
  });

  it('keeps the streak alive if yesterday was active but today has no session yet', () => {
    const today = new Date('2026-03-10T08:00:00');
    expect(calculateStreak(['2026-03-08', '2026-03-09'], today)).toBe(2);
  });

  it('breaks the streak once a full day is missed', () => {
    const today = new Date('2026-03-10T12:00:00');
    expect(calculateStreak(['2026-03-07', '2026-03-08', '2026-03-10'], today)).toBe(1);
  });

  it('returns 0 when there is no recent activity at all', () => {
    const today = new Date('2026-03-10T12:00:00');
    expect(calculateStreak([], today)).toBe(0);
    expect(calculateStreak(['2026-01-01'], today)).toBe(0);
  });

  it('is not confused by unrelated future or far-past dates in the list', () => {
    const today = new Date('2026-03-10T12:00:00');
    expect(calculateStreak(['2026-03-09', '2026-03-10', '2026-05-01'], today)).toBe(2);
  });
});
