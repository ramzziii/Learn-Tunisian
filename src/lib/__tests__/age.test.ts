import { calculateAge, dateToIsoDate, trackForDateOfBirth } from '@/lib/age';

function isoDateYearsAgo(years: number, dayOffset = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return dateToIsoDate(d);
}

describe('calculateAge', () => {
  it('is exact on a birthday that falls exactly N years ago today', () => {
    expect(calculateAge(isoDateYearsAgo(13))).toBe(13);
  });

  it("hasn't incremented yet if this year's birthday hasn't happened (birthday is tomorrow)", () => {
    expect(calculateAge(isoDateYearsAgo(13, 1))).toBe(12);
  });

  it("has already incremented if this year's birthday already happened (birthday was yesterday)", () => {
    expect(calculateAge(isoDateYearsAgo(13, -1))).toBe(13);
  });

  it('is 0 for a birth date within the last year', () => {
    expect(calculateAge(isoDateYearsAgo(0))).toBe(0);
  });
});

describe('trackForDateOfBirth', () => {
  it('assigns the kid track at the oldest kid age (12)', () => {
    expect(trackForDateOfBirth(isoDateYearsAgo(12))).toBe('kid');
  });

  it('assigns the adult track at the youngest adult age (13) — the exact boundary', () => {
    expect(trackForDateOfBirth(isoDateYearsAgo(13))).toBe('adult');
  });

  it('assigns the kid track to a newborn', () => {
    expect(trackForDateOfBirth(isoDateYearsAgo(0))).toBe('kid');
  });

  it('assigns the adult track well above the boundary', () => {
    expect(trackForDateOfBirth(isoDateYearsAgo(40))).toBe('adult');
  });

  it('does not flip a 13-year-old back to kid the day before their birthday (still 12 until the actual day)', () => {
    // 13 years ago minus 1 day = birthday is tomorrow, so they're still 12 today.
    expect(trackForDateOfBirth(isoDateYearsAgo(13, 1))).toBe('kid');
  });
});

describe('dateToIsoDate', () => {
  it('formats as zero-padded YYYY-MM-DD', () => {
    const date = new Date(2026, 0, 5); // January 5, 2026 (local time, month is 0-indexed)
    expect(dateToIsoDate(date)).toBe('2026-01-05');
  });
});
