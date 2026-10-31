// Typed date of birth (MM / DD / YYYY): when the three fields make a real,
// complete, non-future date, and when to move focus to the next field.
// Builds dates with the local-date helpers in src/lib/age.ts, so the result
// is local midnight of the typed day in every time zone.
import { dateToIsoDate, isAdult, parseIsoDateLocal } from '@/lib/age';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dob = require('@/lib/dateOfBirthInput');

const TODAY = new Date(2026, 9, 30, 14, 0); // 30 Oct 2026, 2pm local
const check = (month: string, day: string, year: string, today = TODAY) => dob.checkDateOfBirth({ month, day, year }, today);

describe('complete and valid', () => {
  it('a real date becomes an ISO date', () => {
    expect(check('04', '27', '1990')).toEqual({ status: 'valid', iso: '1990-04-27' });
  });

  it('single-digit month and day are fine once the year is complete', () => {
    expect(check('4', '7', '1990')).toEqual({ status: 'valid', iso: '1990-04-07' });
  });

  it('is local midnight of that day, whatever the time zone', () => {
    const result = check('10', '30', '2008');
    expect(parseIsoDateLocal(result.iso).getTime()).toBe(new Date(2008, 9, 30).getTime());
  });
});

describe('not complete yet — nothing is submitted', () => {
  it.each([
    ['', '', ''],
    ['04', '', ''],
    ['04', '27', ''],
    ['04', '27', '199'],
    ['', '27', '1990'],
  ])('%p/%p/%p', (m, d, y) => {
    expect(check(m, d, y)).toEqual({ status: 'incomplete' });
  });
});

describe('impossible dates', () => {
  it.each([
    ['00', '10', '1990'],
    ['13', '10', '1990'],
    ['04', '00', '1990'],
    ['04', '31', '1990'],
    ['06', '31', '1990'],
    ['01', '32', '1990'],
  ])('%p/%p/%p is invalid', (m, d, y) => {
    expect(check(m, d, y).status).toBe('invalid');
  });

  it('29 February only in leap years', () => {
    expect(check('02', '29', '2004').status).toBe('valid');
    expect(check('02', '29', '2000').status).toBe('valid'); // divisible by 400
    expect(check('02', '29', '2003').status).toBe('invalid');
    expect(check('02', '29', '1900').status).toBe('invalid'); // divisible by 100, not 400
    expect(check('02', '30', '2004').status).toBe('invalid');
  });

  it('an implausibly old year is rejected', () => {
    expect(check('01', '01', '1850').status).toBe('invalid');
  });

  it('explains what is wrong in plain words', () => {
    expect(check('13', '01', '1990')).toEqual({ status: 'invalid', message: expect.stringMatching(/month/i) });
    expect(check('02', '30', '1990')).toEqual({ status: 'invalid', message: expect.stringMatching(/doesn.t exist/i) });
  });
});

describe('dates in the future', () => {
  it('tomorrow is in the future; today is not', () => {
    expect(check('10', '31', '2026')).toEqual({ status: 'future', message: expect.stringMatching(/future/i) });
    expect(check('10', '30', '2026').status).toBe('valid');
  });

  it('late at night, today is still today (no UTC shift)', () => {
    expect(check('10', '30', '2026', new Date(2026, 9, 30, 23, 59)).status).toBe('valid');
    expect(check('10', '31', '2026', new Date(2026, 9, 30, 23, 59)).status).toBe('future');
  });
});

describe('the 18+ check on a typed date', () => {
  it('exactly 18 today passes; one day short fails', () => {
    expect(isAdult(check('10', '30', '2008').iso, TODAY)).toBe(true);
    expect(isAdult(check('10', '31', '2008').iso, TODAY)).toBe(false);
  });

  it('just after local midnight on the 18th birthday, it already passes', () => {
    expect(isAdult(check('10', '30', '2008').iso, new Date(2026, 9, 30, 0, 1))).toBe(true);
  });

  it('round-trips through the shared ISO helpers', () => {
    expect(dateToIsoDate(parseIsoDateLocal(check('02', '29', '2004').iso))).toBe('2004-02-29');
  });
});

describe('typing helpers', () => {
  it('keeps digits only, up to the field length', () => {
    expect(dob.digitsOnly('a1-2b3', 2)).toBe('12');
    expect(dob.digitsOnly('19900', 4)).toBe('1990');
  });

  it('moves on from the month after a valid two-digit month', () => {
    expect(dob.isCompleteMonth('04')).toBe(true);
    expect(dob.isCompleteMonth('12')).toBe(true);
    expect(dob.isCompleteMonth('1')).toBe(false);
    expect(dob.isCompleteMonth('13')).toBe(false);
    expect(dob.isCompleteMonth('00')).toBe(false);
  });

  it('moves on from the day after a valid two-digit day', () => {
    expect(dob.isCompleteDay('27')).toBe(true);
    expect(dob.isCompleteDay('31')).toBe(true);
    expect(dob.isCompleteDay('3')).toBe(false);
    expect(dob.isCompleteDay('32')).toBe(false);
    expect(dob.isCompleteDay('00')).toBe(false);
  });
});
