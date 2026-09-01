import type { Track } from '@/types/models';

const KID_TRACK_MAX_AGE = 12;

/**
 * Parses a "YYYY-MM-DD" string as a local-time Date at midnight — NOT
 * `new Date(dateOfBirth)`, which parses a date-only ISO string as UTC
 * midnight. That mismatch (UTC vs. the local time `new Date()` used
 * elsewhere for "today") silently shifts the effective calendar date back
 * by a day in any negative-UTC-offset timezone, which can misclassify
 * someone right at the kid/adult track boundary.
 */
export function parseIsoDateLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** dateOfBirth is an ISO date string ("YYYY-MM-DD"). */
export function calculateAge(dateOfBirth: string): number {
  const dob = parseIsoDateLocal(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function trackForDateOfBirth(dateOfBirth: string): Track {
  return calculateAge(dateOfBirth) <= KID_TRACK_MAX_AGE ? 'kid' : 'adult';
}

export function formatDateOfBirth(dateOfBirth: string): string {
  return parseIsoDateLocal(dateOfBirth).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function dateToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
