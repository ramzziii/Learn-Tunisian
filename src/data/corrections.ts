import { supabase } from '@/lib/supabase/client';
import type { CorrectionRow } from '@/types/database';

export interface PendingCorrection {
  id: string;
  profileId: string;
  createdAt: string;
  targetTable: 'phrase' | 'sentence';
  tunisian: string;
  english: string;
  transliteration: string;
}

/**
 * Parses the {tunisian, english, transliteration} JSON the Edge Function logs
 * every AI turn as. Malformed rows (shouldn't happen, but this is
 * AI-generated data logged from a network response) are skipped rather than
 * crashing the reviewer screen.
 */
function parseCorrection(row: CorrectionRow): PendingCorrection | null {
  try {
    const parsed = JSON.parse(row.ai_generated_text) as { tunisian?: string; english?: string; transliteration?: string };
    if (!parsed.tunisian || !parsed.english) return null;
    return {
      id: row.id,
      profileId: row.profile_id,
      createdAt: row.created_at,
      targetTable: row.target_table === 'phrase' ? 'phrase' : 'sentence',
      tunisian: parsed.tunisian,
      english: parsed.english,
      transliteration: parsed.transliteration ?? '',
    };
  } catch {
    return null;
  }
}

/** Corrections awaiting review (is_correct still null), oldest first. */
export async function fetchPendingCorrections(): Promise<PendingCorrection[]> {
  const { data, error } = await supabase
    .from('corrections')
    .select('*')
    .is('is_correct', null)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data as CorrectionRow[] | null) ?? [])
    .map(parseCorrection)
    .filter((c): c is PendingCorrection => c !== null);
}

export interface ReviewDecision {
  correctionId: string;
  action: 'approve' | 'reject';
  targetTable: 'phrase' | 'sentence';
  tunisianText: string;
  englishText: string;
  transliteration: string;
  topic?: string;
  reviewerName: string;
}

/**
 * Promotes a correction into the verified corpus (phrases/sentences) — calls
 * the talk-review Edge Function, since embedding the final text needs the
 * secret API key. See supabase/functions/talk-review/index.ts.
 */
export async function submitReview(decision: ReviewDecision): Promise<void> {
  const { data, error } = await supabase.functions.invoke('talk-review', { body: decision });
  if (error) throw error;
  if (data?.error) throw new Error(data.error.message ?? 'Review failed.');
}
