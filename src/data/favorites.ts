import { mapFavorite, mapWordGroup, mapWordVariant } from '@/data/mappers';
import { supabase } from '@/lib/supabase/client';
import type { FavoriteRow, WordGroupRow, WordVariantRow } from '@/types/database';
import type { Favorite, WordGroupWithVariants } from '@/types/models';

export async function fetchFavoriteWordGroupIds(profileId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('favorites').select('word_group_id').eq('profile_id', profileId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.word_group_id as string));
}

export async function addFavorite(profileId: string, wordGroupId: string): Promise<Favorite> {
  const { data, error } = await supabase
    .from('favorites')
    .insert({ profile_id: profileId, word_group_id: wordGroupId })
    .select('*')
    .single<FavoriteRow>();
  if (error) throw error;
  return mapFavorite(data);
}

export async function removeFavorite(profileId: string, wordGroupId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('profile_id', profileId)
    .eq('word_group_id', wordGroupId);
  if (error) throw error;
}

export async function fetchFavoriteWordGroups(profileId: string): Promise<WordGroupWithVariants[]> {
  const { data: favoriteRows, error: favoritesError } = await supabase
    .from('favorites')
    .select('word_group_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (favoritesError) throw favoritesError;

  const groupIds = (favoriteRows ?? []).map((row) => row.word_group_id as string);
  if (groupIds.length === 0) return [];

  const { data: groupRows, error: groupsError } = await supabase.from('word_groups').select('*').in('id', groupIds);
  if (groupsError) throw groupsError;
  const groupsById = new Map(((groupRows as WordGroupRow[] | null) ?? []).map((g) => [g.id, g]));

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', groupIds);
  if (variantsError) throw variantsError;
  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const variant of (variantRows as WordVariantRow[] | null) ?? []) {
    const list = variantsByGroup.get(variant.word_group_id) ?? [];
    list.push(variant);
    variantsByGroup.set(variant.word_group_id, list);
  }

  // Preserve most-recently-favorited-first order.
  return groupIds
    .map((id) => groupsById.get(id))
    .filter((g): g is WordGroupRow => g !== undefined)
    .map((group) => ({
      ...mapWordGroup(group),
      variants: (variantsByGroup.get(group.id) ?? []).map(mapWordVariant),
    }));
}
