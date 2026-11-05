/**
 * Admin → Today → "Needs you now": one row per kind of waiting work, most
 * urgent first (learners waiting on an answer come first), only when there's
 * something to do. AI corrections are listed for language reviewers only —
 * being an admin doesn't include language review.
 */
export interface NeedsAttentionInput {
  requestsOpen: number;
  requestsOverdue: number;
  wordsWaitingForReview: number;
  recordingsNeeded: number;
  correctionsWaiting: number;
  isReviewer: boolean;
}

export interface NeedsAttentionRow {
  key: 'requests' | 'review' | 'corrections' | 'recordings';
  icon: string;
  title: string;
  detail: string;
  href: '/admin/requests' | '/admin/review' | '/admin/corrections' | '/admin/audio';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildNeedsAttention(input: NeedsAttentionInput): NeedsAttentionRow[] {
  const rows: NeedsAttentionRow[] = [];
  if (input.requestsOpen > 0) {
    rows.push({
      key: 'requests',
      icon: '💬',
      title: plural(input.requestsOpen, 'translation request', 'translation requests'),
      detail: input.requestsOverdue > 0 ? `${input.requestsOverdue} overdue` : 'None overdue',
      href: '/admin/requests',
    });
  }
  if (input.wordsWaitingForReview > 0) {
    rows.push({
      key: 'review',
      icon: '✅',
      title: `${plural(input.wordsWaitingForReview, 'word', 'words')} waiting for review`,
      detail: 'Approve, fix or reject each one',
      href: '/admin/review',
    });
  }
  if (input.isReviewer && input.correctionsWaiting > 0) {
    rows.push({
      key: 'corrections',
      icon: '🧠',
      title: `${plural(input.correctionsWaiting, 'AI correction', 'AI corrections')} to check`,
      detail: 'From learners’ conversations',
      href: '/admin/corrections',
    });
  }
  if (input.recordingsNeeded > 0) {
    rows.push({
      key: 'recordings',
      icon: '🎙️',
      title: `${plural(input.recordingsNeeded, 'live form needs', 'live forms need')} a native recording`,
      detail: 'Record them in Audio',
      href: '/admin/audio',
    });
  }
  return rows;
}
