import { updateWordVariant } from '@/data/admin/content';
import { mapWordVariant } from '@/data/mappers';
import { orderItemsForSession, RAM_FREE_ITEMS_PER_SESSION, type RamSavedItemProgress } from '@/lib/repeatAfterMe/session';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordVariant } from '@/types/models';

export interface RepeatAfterMeItem {
  /** The word_variant id — one item per opted-in recording. */
  id: string;
  wordGroupId: string;
  englishMeaning: string;
  variant: WordVariant;
}

/**
 * Items for one Repeat After Me session: variants an admin recorded *and*
 * opted in, whose variant and word group are both approved. Ordered by
 * content order, then by the learner's progress (see orderItemsForSession).
 * A free session is capped here — beyond the first RAM_FREE_ITEMS_PER_SESSION
 * only a count is returned, never the items — so the limit doesn't rely on
 * the UI alone.
 */
export async function loadRepeatAfterMeSession(options: {
  isPremium: boolean;
  progress: Readonly<Record<string, RamSavedItemProgress>>;
}): Promise<{ items: RepeatAfterMeItem[]; lockedCount: number }> {
  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .eq('in_repeat_after_me', true)
    .eq('content_status', 'approved')
    .not('audio_path', 'is', null);
  if (variantsError) throw variantsError;
  const variants = (variantRows ?? []) as WordVariantRow[];
  if (variants.length === 0) return { items: [], lockedCount: 0 };

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('*')
    .in('id', [...new Set(variants.map((v) => v.word_group_id))])
    .eq('content_status', 'approved');
  if (groupsError) throw groupsError;
  const groupsById = new Map(((groupRows ?? []) as WordGroupRow[]).map((g) => [g.id, g]));

  const contentOrdered = variants
    // Only the pronunciation belongs here — never an explanation recording.
    .filter((v) => groupsById.has(v.word_group_id) && !!v.audio_path)
    .sort((a, b) => {
      const ga = groupsById.get(a.word_group_id)!;
      const gb = groupsById.get(b.word_group_id)!;
      return (
        ga.sort_order - gb.sort_order ||
        ga.id.localeCompare(gb.id) ||
        a.sort_order - b.sort_order ||
        a.id.localeCompare(b.id)
      );
    })
    .map((row) => ({
      id: row.id,
      wordGroupId: row.word_group_id,
      englishMeaning: groupsById.get(row.word_group_id)!.english_meaning,
      variant: { ...mapWordVariant(row), explanationAudioPath: null },
    }));

  const ordered = orderItemsForSession(contentOrdered, options.progress);
  if (options.isPremium) return { items: ordered, lockedCount: 0 };
  return {
    items: ordered.slice(0, RAM_FREE_ITEMS_PER_SESSION),
    lockedCount: Math.max(0, ordered.length - RAM_FREE_ITEMS_PER_SESSION),
  };
}

/**
 * The admin's answer to "Add this recording to Repeat After Me?". Goes
 * through updateWordVariant (admin-only by RLS, stamps updated_by) and
 * rejects unless the saved row actually carries the choice — e.g. if the
 * 0012 migration hasn't been applied the column comes back missing.
 */
export async function setRepeatAfterMeInclusion(variantId: string, include: boolean, actorAccountId: string): Promise<WordVariant> {
  const saved = await updateWordVariant(variantId, { inRepeatAfterMe: include }, actorAccountId);
  if (saved.inRepeatAfterMe !== include) {
    throw new Error('The Repeat After Me choice was not saved — has the 0012_repeat_after_me migration been applied?');
  }
  return saved;
}
