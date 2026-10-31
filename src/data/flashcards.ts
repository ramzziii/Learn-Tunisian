import { mapWordGroup, mapWordVariant } from '@/data/mappers';
import { buildFlashcardDecks, type FlashcardDeck } from '@/lib/flashcards';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordGroupWithVariants } from '@/types/models';

/**
 * Flashcard data access. Only approved content (content_status =
 * 'approved', the same rule lessons and the phrasebook use) reaches a deck.
 * RLS lets any signed-in user read draft rows, so this boundary is the gate:
 * the queries filter on it, and anything else returned is dropped here too.
 */

const isApproved = (row: { content_status?: string }) => row.content_status === 'approved';

/** This profile's decks: Due today, My favorites, and one per practised category. Read-only. */
export async function fetchFlashcardDecks(profileId: string, now: Date = new Date()): Promise<FlashcardDeck[]> {
  const [{ data: progressRows, error: progressError }, { data: favoriteRows, error: favoritesError }] = await Promise.all([
    supabase
      .from('progress')
      .select('word_group_id, next_review_at, consecutive_incorrect, correct_count')
      .eq('profile_id', profileId),
    supabase.from('favorites').select('word_group_id').eq('profile_id', profileId).order('created_at', { ascending: false }),
  ]);
  if (progressError) throw progressError;
  if (favoritesError) throw favoritesError;

  const progress = ((progressRows ?? []) as {
    word_group_id: string;
    next_review_at: string;
    consecutive_incorrect: number;
    correct_count: number;
  }[]).map((row) => ({
    wordGroupId: row.word_group_id,
    nextReviewAt: row.next_review_at,
    consecutiveIncorrect: row.consecutive_incorrect,
    correctCount: row.correct_count,
  }));
  const favoriteIds = ((favoriteRows ?? []) as { word_group_id: string }[]).map((row) => row.word_group_id);

  const ids = [...new Set([...progress.map((p) => p.wordGroupId), ...favoriteIds])];
  if (ids.length === 0) return buildFlashcardDecks({ progress: [], favoriteIds: [], groups: [], units: [] }, now);

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('id, unit_id, sort_order, content_status')
    .in('id', ids)
    .eq('content_status', 'approved');
  if (groupsError) throw groupsError;
  const groups = ((groupRows ?? []) as { id: string; unit_id: string; sort_order: number; content_status: string }[])
    .filter(isApproved)
    .map((g) => ({ id: g.id, unitId: g.unit_id, sortOrder: g.sort_order }));

  const unitIds = [...new Set(groups.map((g) => g.unitId))];
  let units: { id: string; name: string; sortOrder: number }[] = [];
  if (unitIds.length > 0) {
    const { data: unitRows, error: unitsError } = await supabase.from('units').select('id, name, sort_order').in('id', unitIds);
    if (unitsError) throw unitsError;
    units = ((unitRows ?? []) as { id: string; name: string; sort_order: number }[]).map((u) => ({
      id: u.id,
      name: u.name,
      sortOrder: u.sort_order,
    }));
  }

  return buildFlashcardDecks({ progress, favoriteIds, groups, units }, now);
}

/**
 * The cards for a deck, in the order given: approved word groups with their
 * approved forms. A word with no approved form has nothing to show and is
 * left out.
 */
export async function fetchFlashcards(groupIds: string[]): Promise<WordGroupWithVariants[]> {
  if (groupIds.length === 0) return [];

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('*')
    .in('id', groupIds)
    .eq('content_status', 'approved');
  if (groupsError) throw groupsError;
  const groupsById = new Map(((groupRows ?? []) as WordGroupRow[]).filter(isApproved).map((g) => [g.id, g]));

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', groupIds)
    .eq('content_status', 'approved')
    .order('sort_order');
  if (variantsError) throw variantsError;
  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const variant of ((variantRows ?? []) as WordVariantRow[]).filter(isApproved)) {
    variantsByGroup.set(variant.word_group_id, [...(variantsByGroup.get(variant.word_group_id) ?? []), variant]);
  }

  return groupIds
    .map((id) => groupsById.get(id))
    .filter((g): g is WordGroupRow => g !== undefined && (variantsByGroup.get(g.id)?.length ?? 0) > 0)
    .map((group) => ({ ...mapWordGroup(group), variants: variantsByGroup.get(group.id)!.map(mapWordVariant) }));
}
