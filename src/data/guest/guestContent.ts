import { supabase } from '@/lib/supabase/client';
import type { WordGroupWithVariants, WordVariant } from '@/types/models';

/**
 * Guest-preview content: read only from the guest_preview_* views (migration
 * 0024), which hold just the explicitly selected, approved rows. The views
 * grant specific columns, so every query names them — never select('*').
 */

export interface GuestUnit {
  id: string;
  name: string;
  sortOrder: number;
  isCurriculum: boolean;
}
export interface GuestLesson {
  id: string;
  unitId: string;
  lessonNumber: number;
  title: string | null;
  sortOrder: number;
}

const GROUP_COLUMNS = 'id, unit_id, lesson_number, english_meaning, image_keyword, image_path, sort_order, content_status';
const VARIANT_COLUMNS =
  'id, word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order, native_verified, is_native_voice, content_status, in_repeat_after_me, updated_at, audio_needs_recheck';

export async function fetchGuestUnits(): Promise<GuestUnit[]> {
  const { data, error } = await supabase.from('guest_preview_units').select('id, name, sort_order, is_curriculum').order('sort_order');
  if (error) throw error;
  return ((data ?? []) as { id: string; name: string; sort_order: number; is_curriculum: boolean }[]).map((u) => ({
    id: u.id,
    name: u.name,
    sortOrder: u.sort_order,
    isCurriculum: u.is_curriculum,
  }));
}

export async function fetchGuestLessons(): Promise<GuestLesson[]> {
  const { data, error } = await supabase.from('guest_preview_lessons').select('id, unit_id, lesson_number, title, sort_order').order('sort_order');
  if (error) throw error;
  return ((data ?? []) as { id: string; unit_id: string; lesson_number: number; title: string | null; sort_order: number }[]).map((l) => ({
    id: l.id,
    unitId: l.unit_id,
    lessonNumber: l.lesson_number,
    title: l.title,
    sortOrder: l.sort_order,
  }));
}

interface GroupRow {
  id: string;
  unit_id: string;
  lesson_number: number;
  english_meaning: string;
  image_keyword: string | null;
  image_path: string | null;
  sort_order: number;
  content_status: WordGroupWithVariants['contentStatus'];
}
interface VariantRow {
  id: string;
  word_group_id: string;
  variant_label: WordVariant['variantLabel'];
  word_arabic: string;
  transliteration: string;
  audio_path: string | null;
  notes: string | null;
  sort_order: number;
  native_verified: boolean;
  is_native_voice: boolean;
  content_status: WordVariant['contentStatus'];
  in_repeat_after_me: boolean;
  updated_at: string;
  audio_needs_recheck?: boolean;
}

function toVariant(v: VariantRow): WordVariant {
  return {
    id: v.id,
    wordGroupId: v.word_group_id,
    variantLabel: v.variant_label,
    wordArabic: v.word_arabic,
    transliteration: v.transliteration,
    // Needs re-check (0028): guests never hear it either.
    audioPath: v.audio_needs_recheck ? null : v.audio_path,
    audioNeedsRecheck: v.audio_needs_recheck === true,
    notes: v.notes,
    sortOrder: v.sort_order,
    nativeVerified: v.native_verified,
    contentStatus: v.content_status,
    createdBy: null,
    updatedBy: null,
    createdAt: v.updated_at,
    updatedAt: v.updated_at,
    speakerName: null,
    dialectNotes: null,
    isNativeVoice: v.is_native_voice,
    inRepeatAfterMe: v.in_repeat_after_me,
    recordingSkippedAt: null,
    explanationAudioPath: null,
    approvedBy: null,
    approvedAt: null,
  };
}

/** Guest words, optionally only one lesson's or a given list, with their approved forms. */
export async function fetchGuestWordGroups(filter?: { unitId: string; lessonNumber: number } | { ids: string[] }): Promise<WordGroupWithVariants[]> {
  let query = supabase.from('guest_preview_word_groups').select(GROUP_COLUMNS);
  if (filter && 'ids' in filter) query = query.in('id', filter.ids.length > 0 ? filter.ids : ['__none__']);
  else if (filter) query = query.eq('unit_id', filter.unitId).eq('lesson_number', filter.lessonNumber);
  const { data: groupRows, error } = await query.order('sort_order');
  if (error) throw error;
  const groups = (groupRows ?? []) as GroupRow[];
  if (groups.length === 0) return [];

  const { data: variantRows, error: variantsError } = await supabase
    .from('guest_preview_word_variants')
    .select(VARIANT_COLUMNS)
    .in('word_group_id', groups.map((g) => g.id))
    .order('sort_order');
  if (variantsError) throw variantsError;
  const byGroup = new Map<string, WordVariant[]>();
  for (const v of (variantRows ?? []) as VariantRow[]) {
    byGroup.set(v.word_group_id, [...(byGroup.get(v.word_group_id) ?? []), toVariant(v)]);
  }
  return groups
    .filter((g) => (byGroup.get(g.id)?.length ?? 0) > 0)
    .map((g) => ({
      id: g.id,
      unitId: g.unit_id,
      lessonNumber: g.lesson_number,
      englishMeaning: g.english_meaning,
      imageKeyword: g.image_keyword,
      imagePath: g.image_path,
      sortOrder: g.sort_order,
      contentStatus: g.content_status,
      createdBy: null,
      updatedBy: null,
      createdAt: '',
      updatedAt: '',
      variants: byGroup.get(g.id)!,
    }));
}
