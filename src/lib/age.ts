/** Learn Tunisian is for adults only. The age gate is self-declared: it
 * checks the date the person enters; it does not verify their real age. */
export const ADULT_MIN_AGE = 18;

/**
 * Parses a "YYYY-MM-DD" string as a local-time Date at midnight — NOT
 * `new Date(dateOfBirth)`, which parses a date-only ISO string as UTC
 * midnight. That mismatch (UTC vs. the local time `new Date()` used
 * elsewhere for "today") silently shifts the effective calendar date back
 * by a day in any negative-UTC-offset timezone, which can misclassify
 * someone right at the 18+ boundary.
 */
export function parseIsoDateLocal(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** dateOfBirth is an ISO date string ("YYYY-MM-DD"); `today` is local time. */
export function calculateAge(dateOfBirth: string, today: Date = new Date()): number {
  const dob = parseIsoDateLocal(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/** True when the entered date of birth makes the person 18 or older today
 * (turning 18 today counts). False for an unparseable date. */
export function isAdult(dateOfBirth: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const dob = parseIsoDateLocal(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;
  return calculateAge(dateOfBirth, today) >= ADULT_MIN_AGE;
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
