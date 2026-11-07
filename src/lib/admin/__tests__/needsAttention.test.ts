// Admin → Today → "Needs you now": one row per kind of waiting work, most
// urgent first, only when there's something to do; corrections only for
// language reviewers.
import { buildNeedsAttention } from '@/lib/admin/needsAttention';

const none = { requestsOpen: 0, requestsOverdue: 0, wordsWaitingForReview: 0, recordingsNeeded: 0, correctionsWaiting: 0, isReviewer: true };

describe('buildNeedsAttention', () => {
  it('0029: unread feedback notes, pointing at Admin → Feedback', () => {
    const rows = buildNeedsAttention({ ...none, unreadFeedback: 3 });
    expect(rows.map((r) => [r.key, r.title, r.href])).toEqual([['feedback', '3 feedback notes to read', '/admin/feedback']]);
  });

  it('0028: refused/failed imports and recordings to re-check, before new recordings', () => {
    const rows = buildNeedsAttention({ ...none, recordingsNeeded: 5, recordingsToRecheck: 2, importsNeedingALook: 1 });
    expect(rows.map((r) => [r.key, r.title, r.href])).toEqual([
      ['imports', '1 import needs a look', '/admin/imports'],
      ['recheck', '2 recordings to re-check', '/admin/audio'],
      ['recordings', '5 live forms need a native recording', '/admin/audio'],
    ]);
  });

  it('nothing waiting: an empty list (the screen says "All caught up")', () => {
    expect(buildNeedsAttention(none)).toEqual([]);
  });

  it('one row per kind of work, most urgent first, each pointing at its tab', () => {
    const rows = buildNeedsAttention({ ...none, requestsOpen: 2, requestsOverdue: 1, wordsWaitingForReview: 283, recordingsNeeded: 41, correctionsWaiting: 3 });
    expect(rows.map((r) => [r.key, r.title, r.detail, r.href])).toEqual([
      ['requests', '2 translation requests', '1 overdue', '/admin/requests'],
      ['review', '283 words waiting for review', 'Approve, fix or reject each one', '/admin/review'],
      ['corrections', '3 AI corrections to check', 'From learners’ conversations', '/admin/corrections'],
      ['recordings', '41 live forms need a native recording', 'Record them in Audio', '/admin/audio'],
    ]);
  });

  it('singular wording, and requests that are on time', () => {
    const rows = buildNeedsAttention({ ...none, requestsOpen: 1, wordsWaitingForReview: 1, recordingsNeeded: 1, correctionsWaiting: 1 });
    expect(rows.map((r) => [r.title, r.detail])).toEqual([
      ['1 translation request', 'None overdue'],
      ['1 word waiting for review', 'Approve, fix or reject each one'],
      ['1 AI correction to check', 'From learners’ conversations'],
      ['1 live form needs a native recording', 'Record them in Audio'],
    ]);
  });

  it('AI corrections are only listed for language reviewers', () => {
    const rows = buildNeedsAttention({ ...none, correctionsWaiting: 3, isReviewer: false });
    expect(rows).toEqual([]);
  });
});
