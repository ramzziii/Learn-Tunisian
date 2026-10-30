import { supabase } from '@/lib/supabase/client';
import type { CorrectionRow } from '@/types/database';

export type CorrectionReason = 'too_formal' | 'too_casual' | 'dialected' | 'incorrect' | 'other';

export interface PendingCorrection {
  id: string;
  profileId: string;
  createdAt: string;
  targetTable: 'phrase' | 'sentence';
  tunisian: string;
  english: string;
  transliteration: string;
}

export interface ReviewedCorrection {
  id: string;
  createdAt: string;
  reviewedAt: string;
  targetTable: 'phrase' | 'sentence';
  /** What the AI originally produced. */
  original: { tunisian: string; english: string; transliteration: string };
  /** The text actually promoted — equals `original` when approved as-is. */
  final: { tunisian: string; english: string; transliteration: string };
  wasEdited: boolean;
  reviewerName: string | null;
  correctionReason: CorrectionReason | null;
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
  /** Why the AI's text needed correcting — only meaningful when action is 'reject'. */
  correctionReason?: CorrectionReason;
}

/**
 * Promotes a correction into the verified corpus (phrases/sentences) — calls
 * the talk-review Edge Function, since embedding the final text needs the
 * secret API key. See supabase/functions/talk-review/index.ts.
 */
export async function submitReview(decision: ReviewDecision): Promise<void> {
  const { data, error } = await supabase.functions.invoke('talk-review', { body: decision });
  if (error) {
    // A non-2xx reply (401/403/409…) carries the function's own message in
    // its body; supabase-js only exposes it on error.context.
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    const reply = (await context?.json?.().catch(() => null)) as { error?: { message?: string } } | null | undefined;
    if (reply?.error?.message) throw new Error(reply.error.message);
    throw error instanceof Error ? error : new Error((error as { message?: string }).message ?? 'Review failed.');
  }
  if (data?.error) throw new Error(data.error.message ?? 'Review failed.');
}

/**
 * Parses an {tunisian, english, transliteration} JSON blob the same shape
 * ai_generated_text and corrected_text both use. Returns null on malformed
 * data instead of throwing, same reasoning as parseCorrection above.
 */
function parseTextBlob(json: string): { tunisian: string; english: string; transliteration: string } | null {
  try {
    const parsed = JSON.parse(json) as { tunisian?: string; english?: string; transliteration?: string };
    if (!parsed.tunisian || !parsed.english) return null;
    return { tunisian: parsed.tunisian, english: parsed.english, transliteration: parsed.transliteration ?? '' };
  } catch {
    return null;
  }
}

/**
 * Resolved corrections (is_correct no longer null), most recent first — the
 * browsable training-data log: what the AI produced, what was actually
 * promoted, and why it needed changing. The corrections table is updated in
 * place on review (never deleted — see talk-review/index.ts), so this is a
 * complete history, not a separate log table.
 */
export async function fetchReviewedCorrections(): Promise<ReviewedCorrection[]> {
  const { data, error } = await supabase
    .from('corrections')
    .select('*')
    .not('is_correct', 'is', null)
    .order('reviewed_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  return ((data as CorrectionRow[] | null) ?? [])
    .map((row): ReviewedCorrection | null => {
      const original = parseTextBlob(row.ai_generated_text);
      if (!original || !row.reviewed_at) return null;
      const edited = row.corrected_text ? parseTextBlob(row.corrected_text) : null;
      return {
        id: row.id,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
        targetTable: row.target_table === 'phrase' ? 'phrase' : 'sentence',
        original,
        final: edited ?? original,
        wasEdited: edited !== null,
        reviewerName: row.reviewer_name,
        correctionReason: (row.correction_reason as CorrectionReason | null) ?? null,
      };
    })
    .filter((c): c is ReviewedCorrection => c !== null);
}
