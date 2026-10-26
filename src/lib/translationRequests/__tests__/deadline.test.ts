// "We will respond within 3 business days": business days are Monday–Friday
// in Tunis time (UTC+1, no DST), and the deadline is the end of the 3rd
// business day after the day the request was sent. Must match the SQL
// function translation_request_due_at (0015_translation_requests.sql).
import {
  computeResponseDeadline,
  deadlineStatus,
  describeDeadline,
  RESPONSE_BUSINESS_DAYS,
} from '@/lib/translationRequests/deadline';

const at = (iso: string) => new Date(iso);

it('is three business days', () => {
  expect(RESPONSE_BUSINESS_DAYS).toBe(3);
});

describe('computeResponseDeadline', () => {
  it.each([
    // [sent (UTC), due = midnight Tunis after the 3rd business day (UTC), why]
    ['2026-10-26T09:00:00Z', '2026-10-29T23:00:00Z', 'Monday → end of Thursday'],
    ['2026-10-28T09:00:00Z', '2026-11-02T23:00:00Z', 'Wednesday → Thu, Fri, Mon → end of Monday'],
    ['2026-10-30T14:00:00Z', '2026-11-04T23:00:00Z', 'Friday → Mon, Tue, Wed → end of Wednesday'],
    ['2026-10-31T10:00:00Z', '2026-11-04T23:00:00Z', 'Saturday → end of Wednesday'],
    ['2026-11-01T10:00:00Z', '2026-11-04T23:00:00Z', 'Sunday → end of Wednesday'],
    ['2026-10-30T22:30:00Z', '2026-11-04T23:00:00Z', 'Friday 23:30 in Tunis is still Friday'],
    ['2026-10-29T23:30:00Z', '2026-11-04T23:00:00Z', 'Thursday 23:30 UTC is already Friday in Tunis'],
  ])('sent %s → due %s (%s)', (sent, due) => {
    expect(computeResponseDeadline(at(sent)).toISOString()).toBe(at(due).toISOString());
  });
});

describe('describeDeadline (what the learner reads)', () => {
  it('names the last day to expect an answer', () => {
    expect(describeDeadline(at('2026-11-04T23:00:00Z'))).toBe('Wed, Nov 4');
    expect(describeDeadline(at('2026-10-29T23:00:00Z'))).toBe('Thu, Oct 29');
  });
});

describe('deadlineStatus (the admin queue)', () => {
  const due = at('2026-11-04T23:00:00Z');
  const before = (ms: number) => new Date(due.getTime() - ms);
  const after = (ms: number) => new Date(due.getTime() + ms);
  const HOUR = 3_600_000;

  it.each([
    [before(2 * 24 * HOUR + 5 * HOUR), { overdue: false, label: '2d 5h left' }],
    [before(5 * HOUR + 59 * 60_000), { overdue: false, label: '5h left' }],
    [before(30 * 60_000), { overdue: false, label: 'Less than 1h left' }],
    [due, { overdue: true, label: 'Overdue by less than 1h' }],
    [after(3 * HOUR), { overdue: true, label: 'Overdue by 3h' }],
    [after(26 * HOUR), { overdue: true, label: 'Overdue by 1d 2h' }],
  ])('%p → %p', (now, expected) => {
    expect(deadlineStatus(due, now)).toEqual(expected);
  });
});
