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
  /** 0028: recordings waiting for re-check after a spelling change. */
  recordingsToRecheck?: number;
  /** 0028: refused or failed imports not marked as seen. */
  importsNeedingALook?: number;
  isReviewer: boolean;
}

export interface NeedsAttentionRow {
  key: 'requests' | 'review' | 'corrections' | 'recordings' | 'recheck' | 'imports';
  icon: string;
  title: string;
  detail: string;
  href: '/admin/requests' | '/admin/review' | '/admin/corrections' | '/admin/audio' | '/admin/imports';
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
  if ((input.importsNeedingALook ?? 0) > 0) {
    rows.push({
      key: 'imports',
      icon: '📥',
      title: `${plural(input.importsNeedingALook!, 'import needs', 'imports need')} a look`,
      detail: 'Refused or failed — see what went wrong',
      href: '/admin/imports',
    });
  }
  if ((input.recordingsToRecheck ?? 0) > 0) {
    rows.push({
      key: 'recheck',
      icon: '🔁',
      title: `${plural(input.recordingsToRecheck!, 'recording', 'recordings')} to re-check`,
      detail: 'Spelling changed — listen in Audio → Re-check',
      href: '/admin/audio',
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
