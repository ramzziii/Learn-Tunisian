import { dateToIsoDate } from '@/lib/age';

/**
 * The typed date of birth (MM / DD / YYYY) at the age gate. Only a complete,
 * real, non-future date counts; anything else is "incomplete" (still being
 * typed) or explained as invalid. Dates are built with the local Date
 * constructor and dateToIsoDate (src/lib/age.ts) — never by parsing an ISO
 * string, which JS treats as UTC midnight and can shift a day.
 */

export interface DateOfBirthParts {
  month: string;
  day: string;
  year: string;
}

export type DateOfBirthCheck =
  | { status: 'incomplete' }
  | { status: 'invalid'; message: string }
  | { status: 'future'; message: string }
  | { status: 'valid'; iso: string };

/** Oldest plausible birth year, relative to today. */
const MAX_AGE_YEARS = 120;

export function digitsOnly(text: string, maxLength: number): string {
  return text.replace(/\D/g, '').slice(0, maxLength);
}

/** Days in a month (1–12) of a year — 29 for February in leap years. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Two digits and 01–12: time to move on to the day. */
export function isCompleteMonth(month: string): boolean {
  if (month.length !== 2) return false;
  const m = Number(month);
  return m >= 1 && m <= 12;
}

/** Two digits and 01–31: time to move on to the year. (The exact month length is checked once the year is known.) */
export function isCompleteDay(day: string): boolean {
  if (day.length !== 2) return false;
  const d = Number(day);
  return d >= 1 && d <= 31;
}

export function checkDateOfBirth({ month, day, year }: DateOfBirthParts, today: Date = new Date()): DateOfBirthCheck {
  if (!month || !day || year.length < 4) return { status: 'incomplete' };

  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return { status: 'invalid', message: 'Please enter a month from 01 to 12.' };
  }
  if (!Number.isInteger(y) || y < today.getFullYear() - MAX_AGE_YEARS) {
    return { status: 'invalid', message: 'Please check the year.' };
  }
  if (!Number.isInteger(d) || d < 1 || d > daysInMonth(y, m)) {
    return { status: 'invalid', message: 'That date doesn’t exist — please check the day and month.' };
  }

  const birth = new Date(y, m - 1, d);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth.getTime() > todayStart.getTime()) {
    return { status: 'future', message: 'That date is in the future — please check it.' };
  }
  return { status: 'valid', iso: dateToIsoDate(birth) };
}
