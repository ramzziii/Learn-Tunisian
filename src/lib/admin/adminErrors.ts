/**
 * Plain words for the database's refusals on admin saves (0028): approving
 * and rejecting are for language reviewers; admins can still edit, send back
 * to draft, or archive. Anything else keeps its own message.
 */
export function adminSaveErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
  if (message.includes('only language reviewers can approve or reject')) {
    return 'Only language reviewers can make content live or reject it. You can edit it, send it back to draft, or archive it.';
  }
  if (message.includes('only language reviewers can mark text as checked')) {
    return 'Only language reviewers can mark text as checked by a native speaker.';
  }
  if (message.includes('cleared only by confirming it or replacing it')) {
    return 'A recording waiting for re-check is cleared in Audio → Re-check (confirm it, or record a new one).';
  }
  return message || fallback;
}

/** Statuses only language reviewers may set (0028). */
export const REVIEWER_ONLY_STATUSES = ['approved', 'rejected'] as const;
