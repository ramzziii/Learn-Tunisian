import { supabase } from '@/lib/supabase/client';
import type { ContentStatus } from '@/types/models';

export interface AdminMetrics {
  unitCount: number;
  lessonCount: number;
  wordGroupCount: number;
  wordVariantCount: number;
  wordGroupsByStatus: Record<ContentStatus, number>;
  pendingCorrectionsCount: number;
  /** 0028: recordings waiting for re-check after a spelling change. */
  recordingsToRecheckCount: number;
  /** 0028: refused or failed imports nobody has marked as seen. */
  importsNeedingALookCount: number;
  /** 0029: feedback notes nobody has read yet. */
  unreadFeedbackCount: number;
}

const EMPTY_STATUS_COUNTS: Record<ContentStatus, number> = {
  draft: 0,
  pending_review: 0,
  approved: 0,
  rejected: 0,
  archived: 0,
};

/** The admin dashboard's at-a-glance overview — counts only, no row data, so this stays cheap as the catalog grows. */
export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const [units, lessons, groupStatuses, variants, pendingCorrections] = await Promise.all([
    supabase.from('units').select('*', { count: 'exact', head: true }),
    supabase.from('lessons').select('*', { count: 'exact', head: true }),
    supabase.from('word_groups').select('content_status'),
    supabase.from('word_variants').select('*', { count: 'exact', head: true }),
    supabase.from('corrections').select('*', { count: 'exact', head: true }).is('is_correct', null),
  ]);
  const [recheck, imports, feedback] = await Promise.all([
    supabase.from('word_variants').select('*', { count: 'exact', head: true }).eq('audio_needs_recheck', true).not('audio_path', 'is', null),
    supabase
      .from('content_import_runs')
      .select('*', { count: 'exact', head: true })
      .is('acknowledged_at', null)
      .in('outcome', ['refused', 'failed']),
    supabase.from('app_feedback').select('*', { count: 'exact', head: true }).is('read_at', null),
  ]);
  if (recheck.error) throw recheck.error;
  if (imports.error) throw imports.error;
  // Feedback is newer (0029): until it's applied, the count is just 0.
  const unreadFeedback = feedback.error ? 0 : (feedback.count ?? 0);
  if (units.error) throw units.error;
  if (lessons.error) throw lessons.error;
  if (groupStatuses.error) throw groupStatuses.error;
  if (variants.error) throw variants.error;
  if (pendingCorrections.error) throw pendingCorrections.error;

  const wordGroupsByStatus = { ...EMPTY_STATUS_COUNTS };
  const groupRows = (groupStatuses.data ?? []) as { content_status: string }[];
  for (const row of groupRows) {
    const status = row.content_status as ContentStatus;
    wordGroupsByStatus[status] = (wordGroupsByStatus[status] ?? 0) + 1;
  }

  return {
    unitCount: units.count ?? 0,
    lessonCount: lessons.count ?? 0,
    wordGroupCount: groupRows.length,
    wordVariantCount: variants.count ?? 0,
    wordGroupsByStatus,
    pendingCorrectionsCount: pendingCorrections.count ?? 0,
    recordingsToRecheckCount: recheck.count ?? 0,
    importsNeedingALookCount: imports.count ?? 0,
    unreadFeedbackCount: unreadFeedback,
  };
}
