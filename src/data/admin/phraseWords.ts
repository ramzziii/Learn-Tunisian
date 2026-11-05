import { mapWordGroup, mapWordVariant } from '@/data/mappers';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordGroupWithVariants } from '@/types/models';

const PAGE = 1000;

export interface PhraseWordLink {
  wordId: string;
  shownArabic: string;
  shownLatin: string;
}

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** A phrase's saved "Words used", in card order (admin). */
export async function fetchPhraseWordLinksAdmin(phraseId: string): Promise<PhraseWordLink[]> {
  const { data, error } = await supabase
    .from('phrase_word_links')
    .select('word_id, position, shown_arabic, shown_latin')
    .eq('phrase_id', phraseId)
    .order('position');
  if (error) throw error;
  return ((data ?? []) as { word_id: string; position: number; shown_arabic: string; shown_latin: string }[])
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ wordId: r.word_id, shownArabic: r.shown_arabic, shownLatin: r.shown_latin }));
}

/**
 * Every word that can be linked: lesson words and Phrasebook entries alike,
 * except rejected or archived ones (drafts included — the admin sees what's
 * coming; learners only ever get approved words).
 */
export async function fetchLinkCandidatesAdmin(): Promise<WordGroupWithVariants[]> {
  const [groups, variants] = await Promise.all([selectAll<WordGroupRow>('word_groups', '*'), selectAll<WordVariantRow>('word_variants', '*')]);
  const live = (status: string) => status !== 'rejected' && status !== 'archived';
  const byGroup = new Map<string, WordVariantRow[]>();
  for (const v of variants) {
    if (!live(v.content_status)) continue;
    byGroup.set(v.word_group_id, [...(byGroup.get(v.word_group_id) ?? []), v]);
  }
  return groups
    .filter((g) => live(g.content_status) && (byGroup.get(g.id)?.length ?? 0) > 0)
    .map((g) => ({ ...mapWordGroup(g), variants: (byGroup.get(g.id) ?? []).sort((a, b) => a.sort_order - b.sort_order).map(mapWordVariant) }));
}

/** Saves the whole list at once (admins only, enforced by the database), in this order. */
export async function savePhraseWordLinks(phraseId: string, links: PhraseWordLink[]): Promise<void> {
  const { error } = await supabase.rpc('set_phrase_word_links', {
    p_phrase_id: phraseId,
    p_links: links.map((l) => ({ word_id: l.wordId, shown_arabic: l.shownArabic.trim(), shown_latin: l.shownLatin.trim() })),
  });
  if (error) throw error;
}
