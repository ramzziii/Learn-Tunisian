import { supabase } from '@/lib/supabase/client';

/**
 * The content import log (0028 content_import_runs): one row per
 * scripts/import-content.mjs run with --execute (dry runs are never logged).
 * Admins can read it and mark a run as seen; only the script writes it.
 */
export interface ImportRun {
  id: string;
  startedAt: string;
  sourceFile: string;
  outcome: 'imported' | 'refused' | 'failed';
  rowsRead: number;
  summary: Record<string, number>;
  problems: { rows?: number[]; message: string }[];
  acknowledgedAt: string | null;
}

interface ImportRunRow {
  id: string;
  started_at: string;
  source_file: string;
  outcome: ImportRun['outcome'];
  rows_read: number;
  summary: Record<string, number> | null;
  problems: ImportRun['problems'] | null;
  acknowledged_at: string | null;
}

const toRun = (r: ImportRunRow): ImportRun => ({
  id: r.id,
  startedAt: r.started_at,
  sourceFile: r.source_file,
  outcome: r.outcome,
  rowsRead: r.rows_read,
  summary: r.summary ?? {},
  problems: Array.isArray(r.problems) ? r.problems : [],
  acknowledgedAt: r.acknowledged_at,
});

/** The most recent runs, newest first. */
export async function fetchImportRuns(limit = 30): Promise<ImportRun[]> {
  const { data, error } = await supabase
    .from('content_import_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ImportRunRow[]).map(toRun);
}

/** "Mark as seen": takes it off Today's "Needs you now". */
export async function acknowledgeImportRun(id: string): Promise<void> {
  const { error } = await supabase.from('content_import_runs').update({ acknowledged_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

const SUMMARY_LABELS: [string, string][] = [
  ['new_words', 'new words'],
  ['new_forms', 'new forms'],
  ['changed_words', 'changed words'],
  ['changed_forms', 'changed forms'],
  ['new_lessons', 'new lessons'],
  ['new_units', 'new units'],
];

/** "12 new words · 3 changed forms" — only the counts that aren't zero. */
export function summaryLine(summary: Record<string, number>): string {
  const parts = SUMMARY_LABELS.filter(([key]) => (summary[key] ?? 0) > 0).map(([key, label]) => `${summary[key]} ${label}`);
  return parts.length > 0 ? parts.join(' · ') : 'No changes';
}
