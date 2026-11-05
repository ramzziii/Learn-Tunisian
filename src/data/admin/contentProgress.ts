import { supabase } from '@/lib/supabase/client';

const PAGE = 1000;
const LABEL_RANK: Record<string, number> = { primary: 0, also_heard: 1, masculine: 2, feminine: 3 };
const UNREVIEWED = new Set(['draft', 'pending_review']);
const isGone = (status: string) => status === 'rejected' || status === 'archived';

interface UnitRowLite {
  id: string;
  name: string;
  sort_order: number;
  is_curriculum: boolean;
}
interface GroupRowLite {
  id: string;
  unit_id: string;
  lesson_number: number;
  english_meaning: string;
  sort_order: number;
  content_status: string;
}
interface VariantRowLite {
  id: string;
  word_group_id: string;
  variant_label: string;
  content_status: string;
  is_native_voice: boolean;
  audio_path: string | null;
}

export interface ProgressCounts {
  /** Word groups that aren't rejected or archived. */
  words: number;
  approved: number;
  /** Approved words whose approved forms all have a native recording. */
  withNativeAudio: number;
  /** Draft or pending-review words. */
  awaitingReview: number;
}

export interface UnitProgress extends ProgressCounts {
  unitId: string;
  name: string;
  isPhrasebook: boolean;
}

export interface NeedsRecordingItem {
  variantId: string;
  wordGroupId: string;
  variantLabel: string;
  englishMeaning: string;
  unitName: string;
}

export interface ContentProgress {
  overall: ProgressCounts;
  units: UnitProgress[];
  /** Approved forms without a native recording, in working order (the recording sheet's rule). */
  needsRecording: NeedsRecordingItem[];
}

const hasNativeAudio = (v: VariantRowLite) => v.is_native_voice && !!v.audio_path;

/** Pure: the dashboard's progress numbers from units, word groups and forms. */
export function computeContentProgress(units: UnitRowLite[], groups: GroupRowLite[], variants: VariantRowLite[]): ContentProgress {
  const formsByGroup = new Map<string, VariantRowLite[]>();
  for (const v of variants) formsByGroup.set(v.word_group_id, [...(formsByGroup.get(v.word_group_id) ?? []), v]);

  const countsFor = (unitGroups: GroupRowLite[]): ProgressCounts => {
    const live = unitGroups.filter((g) => !isGone(g.content_status));
    const approved = live.filter((g) => g.content_status === 'approved');
    return {
      words: live.length,
      approved: approved.length,
      withNativeAudio: approved.filter((g) => {
        const forms = (formsByGroup.get(g.id) ?? []).filter((v) => v.content_status === 'approved');
        return forms.length > 0 && forms.every(hasNativeAudio);
      }).length,
      awaitingReview: live.filter((g) => UNREVIEWED.has(g.content_status)).length,
    };
  };

  const orderedUnits = [...units].sort((a, b) => a.sort_order - b.sort_order);
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const needsRecording = variants
    .filter((v) => v.content_status === 'approved' && !hasNativeAudio(v))
    .filter((v) => {
      const g = groupsById.get(v.word_group_id);
      return !!g && !isGone(g.content_status);
    })
    .sort((a, b) => {
      const ga = groupsById.get(a.word_group_id)!;
      const gb = groupsById.get(b.word_group_id)!;
      return (
        (unitsById.get(ga.unit_id)?.sort_order ?? 0) - (unitsById.get(gb.unit_id)?.sort_order ?? 0) ||
        ga.lesson_number - gb.lesson_number ||
        ga.sort_order - gb.sort_order ||
        ga.id.localeCompare(gb.id) ||
        (LABEL_RANK[a.variant_label] ?? 9) - (LABEL_RANK[b.variant_label] ?? 9)
      );
    })
    .map((v) => {
      const g = groupsById.get(v.word_group_id)!;
      return {
        variantId: v.id,
        wordGroupId: g.id,
        variantLabel: v.variant_label,
        englishMeaning: g.english_meaning,
        unitName: unitsById.get(g.unit_id)?.name ?? '',
      };
    });

  return {
    overall: countsFor(groups),
    units: orderedUnits
      .map((u) => ({ unitId: u.id, name: u.name, isPhrasebook: u.is_curriculum === false, ...countsFor(groups.filter((g) => g.unit_id === u.id)) }))
      .filter((u) => u.words > 0),
    needsRecording,
  };
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

/**
 * The admin dashboard's content progress: per unit and overall, plus the
 * forms that still need a native recording. Reads only the columns it needs;
 * a failed read is an error, never zeros.
 */
export async function fetchContentProgress(): Promise<ContentProgress> {
  const [units, groups, variants] = await Promise.all([
    selectAll<UnitRowLite>('units', 'id, name, sort_order, is_curriculum'),
    selectAll<GroupRowLite>('word_groups', 'id, unit_id, lesson_number, english_meaning, sort_order, content_status'),
    selectAll<VariantRowLite>('word_variants', 'id, word_group_id, variant_label, content_status, is_native_voice, audio_path'),
  ]);
  return computeContentProgress(units, groups, variants);
}
