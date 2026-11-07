import { updateWordVariant } from '@/data/admin/content';
import { mapLearnerWordVariant } from '@/data/mappers';
import { isGuestSessionActive } from '@/lib/guest/guestSession';
import { orderItemsForSession, type RamSavedItemProgress } from '@/lib/repeatAfterMe/session';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordVariant } from '@/types/models';

// Guest-preview content, loaded only in guest mode.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const guestContent = async (): Promise<typeof import('@/data/guest/guestContent')> => require('@/data/guest/guestContent');

export interface RepeatAfterMeItem {
  /** The word_variant id — one item per opted-in recording. */
  id: string;
  wordGroupId: string;
  englishMeaning: string;
  variant: WordVariant;
}

interface SessionOptions {
  /** Premium: every item. */
  unlimited: boolean;
  /** Recordings already opened (counted) — always included. */
  openIds: ReadonlySet<string>;
  /** How many new recordings the allowance still covers. */
  remaining: number;
  progress: Readonly<Record<string, RamSavedItemProgress>>;
}

/**
 * Items for one Repeat After Me session: variants an admin recorded *and*
 * opted in, whose variant and word group are both approved. Ordered by
 * content order, then by the learner's progress (see orderItemsForSession).
 * Without Premium only the recordings already opened plus new ones up to
 * `remaining` are returned — the rest only as a count, never the items — so
 * the allowance doesn't rely on the UI alone. Guests get the preview
 * recordings (guest views) only.
 */
export async function loadRepeatAfterMeSession(options: SessionOptions): Promise<{ items: RepeatAfterMeItem[]; lockedCount: number }> {
  const contentOrdered = isGuestSessionActive() ? await guestItems() : await accountItems();
  if (contentOrdered.length === 0) return { items: [], lockedCount: 0 };

  const ordered = orderItemsForSession(contentOrdered, options.progress);
  if (options.unlimited) return { items: ordered, lockedCount: 0 };
  let newLeft = Math.max(0, options.remaining);
  const items = ordered.filter((item) => {
    if (options.openIds.has(item.id)) return true;
    if (newLeft === 0) return false;
    newLeft -= 1;
    return true;
  });
  return { items, lockedCount: ordered.length - items.length };
}

async function accountItems(): Promise<RepeatAfterMeItem[]> {
  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .eq('in_repeat_after_me', true)
    .eq('content_status', 'approved')
    .not('audio_path', 'is', null);
  if (variantsError) throw variantsError;
  const variants = (variantRows ?? []) as WordVariantRow[];
  if (variants.length === 0) return [];

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('*')
    .in('id', [...new Set(variants.map((v) => v.word_group_id))])
    .eq('content_status', 'approved');
  if (groupsError) throw groupsError;
  const groupsById = new Map(((groupRows ?? []) as WordGroupRow[]).map((g) => [g.id, g]));

  return variants
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
      variant: { ...mapLearnerWordVariant(row), explanationAudioPath: null },
    }));
}

/** The guest preview's opted-in recordings (approved words only, via the guest views). */
async function guestItems(): Promise<RepeatAfterMeItem[]> {
  const words = await (await guestContent()).fetchGuestWordGroups();
  return words
    .filter((w) => w.contentStatus === 'approved')
    .flatMap((w) =>
      w.variants
        .filter((v) => v.inRepeatAfterMe && !!v.audioPath && v.contentStatus === 'approved')
        .map((v) => ({ id: v.id, wordGroupId: w.id, englishMeaning: w.englishMeaning, variant: { ...v, explanationAudioPath: null } }))
    );
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
