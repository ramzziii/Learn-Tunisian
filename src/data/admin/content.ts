// Admin-only content CRUD — reads here are unfiltered by content_status
// (unlike src/data/content.ts's learner-facing reads, which only ever see
// 'approved' rows). Every write takes an explicit actorAccountId and stamps
// created_by/updated_by (the DB's set_updated_at trigger only maintains
// updated_at, not who changed it).

import { supabase } from '@/lib/supabase/client';
import { mapLesson, mapUnit, mapWordGroup, mapWordVariant } from '@/data/mappers';
import type { LessonRow, UnitRow, WordGroupRow, WordVariantRow } from '@/types/database';
import type { ContentStatus, Lesson, Unit, VariantLabel, WordGroup, WordGroupWithVariants, WordVariant } from '@/types/models';

/** A friendly, UI-displayable error for a write the DB rejected on a known constraint — see wrapWriteError. */
export class AdminConstraintError extends Error {}

interface PostgrestLikeError {
  message: string;
  code?: string;
}

function wrapWriteError(error: PostgrestLikeError): never {
  if (error.code === '23505' && error.message.includes('word_variants_one_primary_idx')) {
    throw new AdminConstraintError('This word group already has a primary variant — only one is allowed.');
  }
  if (error.message.includes('must have exactly one primary variant')) {
    throw new AdminConstraintError(
      'This word group needs exactly one "primary" variant, or both a "masculine" and a "feminine" variant, before this change can be saved.'
    );
  }
  if (error.code === '23505' && error.message.includes('lessons_unit_lesson_number_key')) {
    throw new AdminConstraintError('A lesson with this number already exists in this unit.');
  }
  if (error.code === '23505') {
    throw new AdminConstraintError('That ID is already in use — choose a different one.');
  }
  throw error;
}

// ---- Units ----

export async function listUnitsAdmin(): Promise<Unit[]> {
  const { data, error } = await supabase.from('units').select('*').order('sort_order');
  if (error) throw error;
  return ((data ?? []) as UnitRow[]).map(mapUnit);
}

export async function createUnit(
  input: { name: string; sortOrder: number; isCurriculum: boolean },
  actorAccountId: string
): Promise<Unit> {
  const { data, error } = await supabase
    .from('units')
    .insert({
      name: input.name,
      sort_order: input.sortOrder,
      is_curriculum: input.isCurriculum,
      created_by: actorAccountId,
      updated_by: actorAccountId,
    })
    .select('*')
    .single<UnitRow>();
  if (error) wrapWriteError(error);
  return mapUnit(data);
}

export async function updateUnit(
  unitId: string,
  patch: Partial<{ name: string; sortOrder: number; isCurriculum: boolean }>,
  actorAccountId: string
): Promise<Unit> {
  const { data, error } = await supabase
    .from('units')
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      ...(patch.isCurriculum !== undefined && { is_curriculum: patch.isCurriculum }),
      updated_by: actorAccountId,
    })
    .eq('id', unitId)
    .select('*')
    .single<UnitRow>();
  if (error) wrapWriteError(error);
  return mapUnit(data);
}

/** Cascades to this unit's lessons, word_groups, word_variants, progress, and
 * favorites rows (all `on delete cascade`) — confirm with the admin before
 * calling this. */
export async function deleteUnit(unitId: string): Promise<void> {
  const { error } = await supabase.from('units').delete().eq('id', unitId);
  if (error) wrapWriteError(error);
}

// ---- Lessons ----

export async function listLessonsForUnit(unitId: string): Promise<Lesson[]> {
  const { data, error } = await supabase.from('lessons').select('*').eq('unit_id', unitId).order('sort_order');
  if (error) throw error;
  return ((data ?? []) as LessonRow[]).map(mapLesson);
}

export async function getLessonAdmin(lessonId: string): Promise<Lesson | null> {
  const { data, error } = await supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle<LessonRow>();
  if (error) throw error;
  return data ? mapLesson(data) : null;
}

export async function createLesson(
  input: { unitId: string; lessonNumber: number; title: string | null; sortOrder: number },
  actorAccountId: string
): Promise<Lesson> {
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      unit_id: input.unitId,
      lesson_number: input.lessonNumber,
      title: input.title,
      sort_order: input.sortOrder,
      created_by: actorAccountId,
      updated_by: actorAccountId,
    })
    .select('*')
    .single<LessonRow>();
  if (error) wrapWriteError(error);
  return mapLesson(data);
}

export async function updateLesson(
  lessonId: string,
  patch: Partial<{ lessonNumber: number; title: string | null; sortOrder: number }>,
  actorAccountId: string
): Promise<Lesson> {
  const { data, error } = await supabase
    .from('lessons')
    .update({
      ...(patch.lessonNumber !== undefined && { lesson_number: patch.lessonNumber }),
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      updated_by: actorAccountId,
    })
    .eq('id', lessonId)
    .select('*')
    .single<LessonRow>();
  if (error) wrapWriteError(error);
  return mapLesson(data);
}

/** word_groups has no foreign key to lessons.id (matched by (unit_id,
 * lesson_number) instead — see 0003_word_variants.sql), so deleting a
 * lesson that still has word_groups would leave them orphaned rather than
 * cascading. Callers (the lesson detail screen) must block this case rather
 * than call it. */
export async function deleteLesson(lessonId: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) wrapWriteError(error);
}

export interface WordGroupNeedingReview {
  wordGroup: WordGroup;
  unitName: string;
  /** Null if no lesson row exists yet for this group's (unit_id, lesson_number) — shouldn't happen via the admin UI, but the no-FK relationship (see 0003_word_variants.sql) doesn't guarantee it. */
  lessonId: string | null;
}

/**
 * Every word_group not yet (or no longer) live to learners — draft, pending
 * review, or rejected — across the whole catalog, most recently touched
 * first. The cross-cutting "what needs my attention" view that drilling
 * unit -> lesson -> word group doesn't give you. Excludes 'approved' (live)
 * and 'archived' (deliberately retired, not awaiting action).
 */
export async function listWordGroupsNeedingReview(): Promise<WordGroupNeedingReview[]> {
  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('*')
    .in('content_status', ['draft', 'pending_review', 'rejected'])
    .order('updated_at', { ascending: false });
  if (groupsError) throw groupsError;
  const groups = (groupRows ?? []) as WordGroupRow[];
  if (groups.length === 0) return [];

  const unitIds = [...new Set(groups.map((g) => g.unit_id))];
  const [{ data: unitRows, error: unitsError }, { data: lessonRows, error: lessonsError }] = await Promise.all([
    supabase.from('units').select('id, name').in('id', unitIds),
    supabase.from('lessons').select('id, unit_id, lesson_number').in('unit_id', unitIds),
  ]);
  if (unitsError) throw unitsError;
  if (lessonsError) throw lessonsError;

  const unitNameById = new Map(((unitRows ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const lessonIdByKey = new Map(
    ((lessonRows ?? []) as { id: string; unit_id: string; lesson_number: number }[]).map((l) => [
      `${l.unit_id}:${l.lesson_number}`,
      l.id,
    ])
  );

  return groups.map((g) => ({
    wordGroup: mapWordGroup(g),
    unitName: unitNameById.get(g.unit_id) ?? 'Unknown unit',
    lessonId: lessonIdByKey.get(`${g.unit_id}:${g.lesson_number}`) ?? null,
  }));
}

// ---- Word groups (admin reads: ALL statuses, unlike src/data/content.ts) ----

export async function listWordGroupsForLessonAdmin(lessonId: string): Promise<WordGroupWithVariants[]> {
  // Same (unit_id, lesson_number) match fetchWordGroupsForLesson uses in
  // src/data/content.ts — word_groups has no FK to lessons.id.
  const { data: lessonRow, error: lessonError } = await supabase
    .from('lessons')
    .select('unit_id, lesson_number')
    .eq('id', lessonId)
    .single<Pick<LessonRow, 'unit_id' | 'lesson_number'>>();
  if (lessonError) throw lessonError;

  const { data: groupRows, error: groupsError } = await supabase
    .from('word_groups')
    .select('*')
    .eq('unit_id', lessonRow.unit_id)
    .eq('lesson_number', lessonRow.lesson_number)
    .order('sort_order');
  if (groupsError) throw groupsError;
  const groups = (groupRows ?? []) as WordGroupRow[];
  const groupIds = groups.map((g) => g.id);

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('word_group_id', groupIds.length > 0 ? groupIds : ['__none__'])
    .order('sort_order');
  if (variantsError) throw variantsError;

  const variantsByGroup = new Map<string, WordVariantRow[]>();
  for (const v of (variantRows ?? []) as WordVariantRow[]) {
    const list = variantsByGroup.get(v.word_group_id) ?? [];
    list.push(v);
    variantsByGroup.set(v.word_group_id, list);
  }
  return groups.map((g) => ({ ...mapWordGroup(g), variants: (variantsByGroup.get(g.id) ?? []).map(mapWordVariant) }));
}

export async function getWordGroupAdmin(wordGroupId: string): Promise<WordGroupWithVariants | null> {
  const { data: groupRow, error: groupError } = await supabase
    .from('word_groups')
    .select('*')
    .eq('id', wordGroupId)
    .maybeSingle<WordGroupRow>();
  if (groupError) throw groupError;
  if (!groupRow) return null;

  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .eq('word_group_id', wordGroupId)
    .order('sort_order');
  if (variantsError) throw variantsError;

  return { ...mapWordGroup(groupRow), variants: ((variantRows ?? []) as WordVariantRow[]).map(mapWordVariant) };
}

export async function createWordGroup(
  input: {
    id: string;
    unitId: string;
    lessonNumber: number;
    englishMeaning: string;
    imageKeyword: string | null;
    imagePath: string | null;
    sortOrder: number;
    contentStatus: ContentStatus;
  },
  actorAccountId: string
): Promise<WordGroup> {
  const { data, error } = await supabase
    .from('word_groups')
    .insert({
      id: input.id,
      unit_id: input.unitId,
      lesson_number: input.lessonNumber,
      english_meaning: input.englishMeaning,
      image_keyword: input.imageKeyword,
      image_path: input.imagePath,
      sort_order: input.sortOrder,
      content_status: input.contentStatus,
      created_by: actorAccountId,
      updated_by: actorAccountId,
    })
    .select('*')
    .single<WordGroupRow>();
  if (error) wrapWriteError(error);
  return mapWordGroup(data);
}

export async function updateWordGroup(
  wordGroupId: string,
  patch: Partial<{
    englishMeaning: string;
    imageKeyword: string | null;
    imagePath: string | null;
    sortOrder: number;
    contentStatus: ContentStatus;
  }>,
  actorAccountId: string
): Promise<WordGroup> {
  const { data, error } = await supabase
    .from('word_groups')
    .update({
      ...(patch.englishMeaning !== undefined && { english_meaning: patch.englishMeaning }),
      ...(patch.imageKeyword !== undefined && { image_keyword: patch.imageKeyword }),
      ...(patch.imagePath !== undefined && { image_path: patch.imagePath }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      ...(patch.contentStatus !== undefined && { content_status: patch.contentStatus }),
      updated_by: actorAccountId,
    })
    .eq('id', wordGroupId)
    .select('*')
    .single<WordGroupRow>();
  if (error) wrapWriteError(error);
  return mapWordGroup(data);
}

/** Cascades to this group's word_variants, plus any profile's progress and
 * favorites rows referencing it (all `on delete cascade`) — confirm with the
 * admin before calling, especially if content_status was 'approved' (i.e.
 * potentially live to learners). */
export async function deleteWordGroup(wordGroupId: string): Promise<void> {
  const { error } = await supabase.from('word_groups').delete().eq('id', wordGroupId);
  if (error) wrapWriteError(error);
}

// ---- Word variants ----

export async function createWordVariant(
  input: {
    wordGroupId: string;
    variantLabel: VariantLabel;
    wordArabic: string;
    transliteration: string;
    audioPath: string | null;
    notes: string | null;
    sortOrder: number;
    contentStatus: ContentStatus;
    speakerName?: string | null;
    dialectNotes?: string | null;
    isNativeVoice?: boolean;
  },
  actorAccountId: string
): Promise<WordVariant> {
  const { data, error } = await supabase
    .from('word_variants')
    .insert({
      word_group_id: input.wordGroupId,
      variant_label: input.variantLabel,
      word_arabic: input.wordArabic,
      transliteration: input.transliteration,
      audio_path: input.audioPath,
      notes: input.notes,
      sort_order: input.sortOrder,
      content_status: input.contentStatus,
      speaker_name: input.speakerName ?? null,
      dialect_notes: input.dialectNotes ?? null,
      is_native_voice: input.isNativeVoice ?? false,
      created_by: actorAccountId,
      updated_by: actorAccountId,
    })
    .select('*')
    .single<WordVariantRow>();
  // Catches both the one-primary-per-group unique index and the deferred
  // primary/gender-pair trigger (fires at transaction commit, i.e. here).
  if (error) wrapWriteError(error);
  return mapWordVariant(data);
}

export async function updateWordVariant(
  variantId: string,
  patch: Partial<{
    variantLabel: VariantLabel;
    wordArabic: string;
    transliteration: string;
    audioPath: string | null;
    notes: string | null;
    sortOrder: number;
    contentStatus: ContentStatus;
    speakerName: string | null;
    dialectNotes: string | null;
    isNativeVoice: boolean;
    /** Setting this true stamps approved_by/approved_at to this actor/now;
     * setting it false clears them — see the comment below. */
    nativeVerified: boolean;
  }>,
  actorAccountId: string
): Promise<WordVariant> {
  const { data, error } = await supabase
    .from('word_variants')
    .update({
      ...(patch.variantLabel !== undefined && { variant_label: patch.variantLabel }),
      ...(patch.wordArabic !== undefined && { word_arabic: patch.wordArabic }),
      ...(patch.transliteration !== undefined && { transliteration: patch.transliteration }),
      ...(patch.audioPath !== undefined && { audio_path: patch.audioPath }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      ...(patch.contentStatus !== undefined && { content_status: patch.contentStatus }),
      ...(patch.speakerName !== undefined && { speaker_name: patch.speakerName }),
      ...(patch.dialectNotes !== undefined && { dialect_notes: patch.dialectNotes }),
      ...(patch.isNativeVoice !== undefined && { is_native_voice: patch.isNativeVoice }),
      // Stamped here (app layer) rather than a DB trigger, same reasoning as
      // created_by/updated_by — this is the one function that ever flips
      // native_verified, so there's a single point of truth either way.
      // Demoting back to unverified clears the attribution rather than
      // leaving a stale "approved by" on content that no longer is.
      ...(patch.nativeVerified !== undefined && {
        native_verified: patch.nativeVerified,
        approved_by: patch.nativeVerified ? actorAccountId : null,
        approved_at: patch.nativeVerified ? new Date().toISOString() : null,
      }),
      updated_by: actorAccountId,
    })
    .eq('id', variantId)
    .select('*')
    .single<WordVariantRow>();
  if (error) wrapWriteError(error);
  return mapWordVariant(data);
}

/** The deferred constraint trigger can reject this (e.g. deleting a group's
 * only primary with nothing else left) — surfaced as AdminConstraintError,
 * same as create/update. */
export async function deleteWordVariant(variantId: string): Promise<void> {
  const { error } = await supabase.from('word_variants').delete().eq('id', variantId);
  if (error) wrapWriteError(error);
}
