import { mapWordGroup, mapWordVariant } from '@/data/mappers';
import { inPracticeScope, type PracticeScope } from '@/lib/access/practiceScope';
import { isGuestSessionActive } from '@/lib/guest/guestSession';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordGroupWithVariants } from '@/types/models';

// Guest-preview content, loaded only in guest mode.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const guestContent = async (): Promise<typeof import('@/data/guest/guestContent')> => require('@/data/guest/guestContent');

/** Rows per request when loading every approved word (the API caps a response at 1,000). */
export const SEARCH_PAGE_SIZE = 1000;
/** Word ids per forms request (keeps the request URL short). */
const VARIANT_BATCH = 150;

/**
 * The words Dictionary / Search may index — only what this learner can
 * open, so a locked word is never fetched, let alone shown:
 * - guest: the guest-preview views (only preview rows exist there);
 * - free: the open lessons and open phrasebook categories (practice scope);
 * - Premium: every approved word, in pages.
 * Approved only. Nothing is cached on disk; the caller keeps it in memory.
 */
export async function fetchSearchableWordGroups(scope: PracticeScope): Promise<WordGroupWithVariants[]> {
  if (isGuestSessionActive()) {
    const words = await (await guestContent()).fetchGuestWordGroups();
    return words.filter((w) => w.contentStatus === 'approved');
  }

  let groupRows: WordGroupRow[];
  if (scope.all) {
    groupRows = [];
    for (let from = 0; ; from += SEARCH_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('word_groups')
        .select('*')
        .eq('content_status', 'approved')
        .order('sort_order')
        .range(from, from + SEARCH_PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as WordGroupRow[];
      groupRows.push(...page);
      if (page.length < SEARCH_PAGE_SIZE) break;
    }
  } else {
    const filter = scopeFilter(scope);
    if (!filter) return [];
    const { data, error } = await supabase
      .from('word_groups')
      .select('*')
      .or(filter)
      .eq('content_status', 'approved')
      .order('sort_order');
    if (error) throw error;
    groupRows = (data ?? []) as WordGroupRow[];
  }

  // Defence in depth: never index a row outside the scope or not approved,
  // even if the query returned one.
  const groups = groupRows
    .map(mapWordGroup)
    .filter((g) => inPracticeScope(scope, { unitId: g.unitId, lessonNumber: g.lessonNumber, contentStatus: g.contentStatus }));
  if (groups.length === 0) return [];

  const variantRows: WordVariantRow[] = [];
  for (let i = 0; i < groups.length; i += VARIANT_BATCH) {
    const ids = groups.slice(i, i + VARIANT_BATCH).map((g) => g.id);
    const { data, error } = await supabase
      .from('word_variants')
      .select('*')
      .in('word_group_id', ids)
      .eq('content_status', 'approved')
      .order('sort_order');
    if (error) throw error;
    variantRows.push(...((data ?? []) as WordVariantRow[]));
  }

  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const v of variantRows) {
    if (v.content_status !== 'approved') continue;
    const list = variantsByGroup.get(v.word_group_id) ?? [];
    list.push(v);
    variantsByGroup.set(v.word_group_id, list);
  }
  return groups.map((g) => ({ ...g, variants: (variantsByGroup.get(g.id) ?? []).map(mapWordVariant) }));
}

/** PostgREST `or` filter for the open lessons (unit + lesson number) and open phrasebook units; null when nothing is open. */
function scopeFilter(scope: PracticeScope): string | null {
  const parts = [...scope.lessonKeys].map((key) => {
    const at = key.lastIndexOf('#');
    return `and(unit_id.eq.${key.slice(0, at)},lesson_number.eq.${Number(key.slice(at + 1))})`;
  });
  if (scope.unitIds.size > 0) parts.push(`unit_id.in.(${[...scope.unitIds].join(',')})`);
  return parts.length > 0 ? parts.join(',') : null;
}
