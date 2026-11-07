import { mapWordVariant } from '@/data/mappers';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordVariant } from '@/types/models';

// Within a word: the main form first, alternates last.
const LABEL_RANK: Record<string, number> = { primary: 0, masculine: 1, feminine: 2, also_heard: 3 };

export interface FormToReview {
  variant: WordVariant;
  englishMeaning: string;
  unitName: string;
  lessonNumber: number;
}

export type ReviewVerdict = 'ok' | 'fix' | 'reject';

/**
 * Admin → Review → one at a time: every form still waiting for review
 * (draft or pending review), in course order — unit, lesson, word, then
 * primary → masculine → feminine → also heard.
 */
export async function fetchFormsToReview(): Promise<FormToReview[]> {
  const { data: variantRows, error } = await supabase
    .from('word_variants')
    .select('*')
    .in('content_status', ['draft', 'pending_review']);
  if (error) throw error;
  const variants = (variantRows ?? []) as WordVariantRow[];
  if (variants.length === 0) return [];

  const [{ data: groupRows, error: groupsError }, { data: unitRows, error: unitsError }] = await Promise.all([
    supabase.from('word_groups').select('*').in('id', [...new Set(variants.map((v) => v.word_group_id))]),
    supabase.from('units').select('id, name, sort_order'),
  ]);
  if (groupsError) throw groupsError;
  if (unitsError) throw unitsError;
  const groups = new Map(((groupRows ?? []) as WordGroupRow[]).map((g) => [g.id, g]));
  const units = new Map(((unitRows ?? []) as { id: string; name: string; sort_order: number }[]).map((u) => [u.id, u]));

  return variants
    .filter((v) => groups.has(v.word_group_id))
    .sort((a, b) => {
      const ga = groups.get(a.word_group_id)!;
      const gb = groups.get(b.word_group_id)!;
      return (
        (units.get(ga.unit_id)?.sort_order ?? 0) - (units.get(gb.unit_id)?.sort_order ?? 0) ||
        ga.lesson_number - gb.lesson_number ||
        ga.sort_order - gb.sort_order ||
        ga.id.localeCompare(gb.id) ||
        (LABEL_RANK[a.variant_label] ?? 9) - (LABEL_RANK[b.variant_label] ?? 9) ||
        a.sort_order - b.sort_order ||
        a.id.localeCompare(b.id)
      );
    })
    .map((row) => {
      const group = groups.get(row.word_group_id)!;
      return {
        variant: mapWordVariant(row),
        englishMeaning: group.english_meaning,
        unitName: units.get(group.unit_id)?.name ?? '',
        lessonNumber: group.lesson_number,
      };
    });
}

/**
 * One review through 0028's review_word_variant (reviewers only, one
 * transaction, written to the review history). A "fix" sends only the
 * fields that changed. Returns the word's status afterwards ("approved"
 * once all its forms are approved and make a valid set).
 */
export async function reviewWordVariant(input: {
  variantId: string;
  verdict: ReviewVerdict;
  correctedArabic?: string | null;
  correctedTransliteration?: string | null;
  note?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('review_word_variant', {
    p_variant_id: input.variantId,
    p_verdict: input.verdict,
    p_corrected_arabic: input.correctedArabic ?? null,
    p_corrected_transliteration: input.correctedTransliteration ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Plain words for review_word_variant's refusals. */
export function reviewErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? '');
  const known: [string, string][] = [
    ['permission denied', 'Only language reviewers can approve or reject words.'],
    ['already_reviewed', 'Someone already reviewed this form — it was skipped.'],
    ['bad_transliteration', 'Transliteration: lowercase letters and numbers only, single spaces (e.g. “ena ji3an”).'],
    ['latin_in_arabic', 'The Arabic spelling has Latin letters or numbers in it.'],
    ['fix_without_change', 'Nothing was changed — use “Correct” instead, or edit the spelling.'],
    ['fix_needs_correction', 'Type the corrected spelling first.'],
    ['note_too_long', 'The note is too long (1000 characters at most).'],
    ['unknown_variant', 'This form no longer exists — it was skipped.'],
  ];
  return known.find(([code]) => message.includes(code))?.[1] ?? `Couldn't save — ${message || 'unknown error'}`;
}
