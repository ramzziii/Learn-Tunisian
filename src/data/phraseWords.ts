import { mapWordGroup, mapLearnerWordVariant } from '@/data/mappers';
import { isGuestSessionActive } from '@/lib/guest/guestSession';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordGroupWithVariants } from '@/types/models';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const guestContent = async (): Promise<typeof import('@/data/guest/guestContent')> => require('@/data/guest/guestContent');

const LINK_COLUMNS = 'word_id, position, shown_arabic, shown_latin';

interface LinkRow {
  word_id: string;
  position: number;
  shown_arabic: string;
  shown_latin: string;
}

export interface WordUsed {
  wordId: string;
  /** The word as it appears in this phrase. */
  shownArabic: string;
  shownLatin: string;
  /**
   * The linked word (approved, with its approved forms), or null when this
   * learner can't read it — a guest, for a word outside the preview. The card
   * then shows only the form already visible in the phrase, locked.
   */
  word: WordGroupWithVariants | null;
}

/**
 * "Words used" in a phrase, in the admin's saved order (0027). Signed in:
 * links to approved words only. Guests: only the guest preview views. Access
 * to each word (open lesson / category) is decided by the screen with the
 * practice scope, never here. Reads only.
 */
export async function fetchWordsUsed(phraseId: string): Promise<WordUsed[]> {
  const guest = isGuestSessionActive();
  const { data, error } = await supabase
    .from(guest ? 'guest_preview_phrase_word_links' : 'phrase_word_links')
    .select(LINK_COLUMNS)
    .eq('phrase_id', phraseId)
    .order('position');
  if (error) throw error;
  const links = ((data ?? []) as LinkRow[]).sort((a, b) => a.position - b.position);
  if (links.length === 0) return [];
  const ids = links.map((l) => l.word_id);

  if (guest) {
    const words = new Map((await (await guestContent()).fetchGuestWordGroups({ ids })).map((w) => [w.id, w]));
    return links.map((l) => ({ wordId: l.word_id, shownArabic: l.shown_arabic, shownLatin: l.shown_latin, word: words.get(l.word_id) ?? null }));
  }

  const [{ data: groupRows, error: groupsError }, { data: variantRows, error: variantsError }] = await Promise.all([
    supabase.from('word_groups').select('*').in('id', ids).eq('content_status', 'approved'),
    supabase.from('word_variants').select('*').in('word_group_id', ids).eq('content_status', 'approved').order('sort_order'),
  ]);
  if (groupsError) throw groupsError;
  if (variantsError) throw variantsError;
  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const v of (variantRows ?? []) as WordVariantRow[]) {
    if (v.content_status !== 'approved') continue;
    variantsByGroup.set(v.word_group_id, [...(variantsByGroup.get(v.word_group_id) ?? []), v]);
  }
  const words = new Map<string, WordGroupWithVariants>();
  for (const row of (groupRows ?? []) as WordGroupRow[]) {
    if (row.content_status !== 'approved') continue;
    const forms = variantsByGroup.get(row.id) ?? [];
    if (forms.length > 0) words.set(row.id, { ...mapWordGroup(row), variants: forms.map(mapLearnerWordVariant) });
  }
  // A link to a word that isn't approved (or has no approved form) is left out entirely.
  return links
    .filter((l) => words.has(l.word_id))
    .map((l) => ({ wordId: l.word_id, shownArabic: l.shown_arabic, shownLatin: l.shown_latin, word: words.get(l.word_id)! }));
}
