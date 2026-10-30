import { ADULT_MIN_AGE, calculateAge, dateToIsoDate, isAdult, parseIsoDateLocal } from '@/lib/age';

// A fixed local "today" so birthday boundaries are deterministic.
const TODAY = new Date(2026, 9, 27); // 27 Oct 2026, local time

describe('calculateAge', () => {
  it('is exact on a birthday that falls exactly N years ago today', () => {
    expect(calculateAge('2008-10-27', TODAY)).toBe(18);
  });

  it("hasn't incremented yet if this year's birthday is tomorrow", () => {
    expect(calculateAge('2008-10-28', TODAY)).toBe(17);
  });

  it('has already incremented if this year’s birthday was yesterday', () => {
    expect(calculateAge('2008-10-26', TODAY)).toBe(18);
  });

  it('defaults to the real current date', () => {
    const born = new Date();
    born.setFullYear(born.getFullYear() - 30);
    expect(calculateAge(dateToIsoDate(born))).toBe(30);
  });
});

describe('isAdult (the self-declared 18+ age gate)', () => {
  it('requires 18', () => {
    expect(ADULT_MIN_AGE).toBe(18);
  });

  it('passes someone who turns exactly 18 today', () => {
    expect(isAdult('2008-10-27', TODAY)).toBe(true);
  });

  it('fails someone one day short of 18 (birthday is tomorrow)', () => {
    expect(isAdult('2008-10-28', TODAY)).toBe(false);
  });

  it('passes well over 18 and fails a child', () => {
    expect(isAdult('1990-01-01', TODAY)).toBe(true);
    expect(isAdult('2015-06-01', TODAY)).toBe(false);
  });

  it('a 29 February birthday only counts once 1 March arrives in a non-leap year', () => {
    expect(isAdult('2008-02-29', new Date(2026, 1, 28))).toBe(false);
    expect(isAdult('2008-02-29', new Date(2026, 2, 1))).toBe(true);
  });

  it('rejects a date it cannot parse', () => {
    expect(isAdult('', TODAY)).toBe(false);
    expect(isAdult('not-a-date', TODAY)).toBe(false);
  });
});

describe('timezone edge case (parseIsoDateLocal)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('parses YYYY-MM-DD as local midnight, not UTC — no shift back a day in a negative-offset zone', () => {
    process.env.TZ = 'America/Los_Angeles';
    const local = parseIsoDateLocal('2008-10-27');
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2008, 9, 27]);
    // Exactly local midnight on that day — holds in every time zone, even if
    // the TZ switch above doesn't take effect (it doesn't inside Jest on
    // Linux CI, where the zone stays UTC).
    expect(local.getTime()).toBe(new Date(2008, 9, 27).getTime());
    // The trap it avoids: new Date('2008-10-27') is UTC midnight, which is
    // the 26th locally in any zone behind UTC. Only demonstrable when the
    // zone really is behind UTC.
    if (new Date(2008, 9, 27).getTimezoneOffset() > 0) {
      expect(new Date('2008-10-27').getDate()).toBe(26);
    }
  });

  it('a user turning 18 today still passes in a negative-offset timezone', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(isAdult('2008-10-27', new Date(2026, 9, 27, 0, 30))).toBe(true);
    expect(isAdult('2008-10-28', new Date(2026, 9, 27, 23, 30))).toBe(false);
  });
});

describe('dateToIsoDate', () => {
  it('formats as zero-padded YYYY-MM-DD', () => {
    expect(dateToIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
