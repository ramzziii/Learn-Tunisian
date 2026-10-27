/**
 * "We will respond within 3 business days."
 *
 * Business days are Monday–Friday in Tunis time (Africa/Tunis is UTC+1 all
 * year — Tunisia has had no DST since 2009). The deadline is the end of the
 * 3rd business day after the day the request was sent: Monday → end of
 * Thursday, Friday/Saturday/Sunday → end of Wednesday. Public holidays aren't
 * modelled.
 *
 * The authoritative due_at is set by the database
 * (translation_request_due_at in 0015_translation_requests.sql) with the
 * same rule — this copy is for showing the promise before anything is sent,
 * and for the admin queue's time-left labels.
 */
export const RESPONSE_BUSINESS_DAYS = 3;

const TUNIS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The instant the response is due: midnight (Tunis) after the 3rd business day. */
export function computeResponseDeadline(submittedAt: Date): Date {
  // Shift into Tunis wall-clock time, then work on whole UTC days of that.
  const local = new Date(submittedAt.getTime() + TUNIS_OFFSET_MS);
  let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let added = 0;
  while (added < RESPONSE_BUSINESS_DAYS) {
    day += DAY_MS;
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return new Date(day + DAY_MS - TUNIS_OFFSET_MS);
}

/** "Wed, Nov 4" — the last (Tunis) day to expect an answer by. */
export function describeDeadline(dueAt: Date): string {
  return formatTunisDay(new Date(dueAt.getTime() - 1));
}

/** "Mon, Oct 26" for any instant, in Tunis time. */
export function formatTunisDay(instant: Date): string {
  const local = new Date(instant.getTime() + TUNIS_OFFSET_MS);
  return `${WEEKDAYS[local.getUTCDay()]}, ${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}`;
}

function formatSpan(ms: number): string | null {
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return null;
}

/** For the admin queue: time left until the deadline, or how overdue it is. */
export function deadlineStatus(dueAt: Date, now: Date): { overdue: boolean; label: string } {
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining > 0) {
    const span = formatSpan(remaining);
    return { overdue: false, label: span ? `${span} left` : 'Less than 1h left' };
  }
  const span = formatSpan(-remaining);
  return { overdue: true, label: span ? `Overdue by ${span}` : 'Overdue by less than 1h' };
}
