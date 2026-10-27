import { deleteWordVariantAudio, saveRecordedWordVariantAudio, uploadWordVariantAudio } from '@/data/admin/audioUpload';
import { updateWordVariant } from '@/data/admin/content';
import { mapWordVariant } from '@/data/mappers';
import type { AudioFormat } from '@/lib/admin/audioFile';
import { supabase } from '@/lib/supabase/client';
import type { WordGroupRow, WordVariantRow } from '@/types/database';
import type { WordVariant } from '@/types/models';

const AUDIO_BUCKET = 'audio';
// Within a word: the main form first, alternates last.
const LABEL_RANK: Record<string, number> = { primary: 0, masculine: 1, feminine: 2, also_heard: 3 };

/** Why a form is listed as needing a native voice. */
export type RecordingNeed = 'no_audio' | 'missing_file' | 'not_native';

export interface RecordingQueueItem {
  variant: WordVariant;
  englishMeaning: string;
  unitName: string;
  lessonNumber: number;
  reason: RecordingNeed;
}

/** A recorded word form that has no explanation recording yet. */
export type ExplanationQueueItem = Omit<RecordingQueueItem, 'reason'>;

interface VariantContext {
  variants: WordVariantRow[];
  groups: Map<string, WordGroupRow>;
  units: Map<string, { id: string; name: string; sort_order: number }>;
}

/** Every non-archived/rejected form, with its word group and unit. */
async function loadVariantContext(): Promise<VariantContext> {
  const { data: variantRows, error: variantsError } = await supabase
    .from('word_variants')
    .select('*')
    .in('content_status', ['draft', 'pending_review', 'approved']);
  if (variantsError) throw variantsError;
  const variants = (variantRows ?? []) as WordVariantRow[];
  if (variants.length === 0) return { variants, groups: new Map(), units: new Map() };

  const [{ data: groupRows, error: groupsError }, { data: unitRows, error: unitsError }] = await Promise.all([
    supabase.from('word_groups').select('*').in('id', [...new Set(variants.map((v) => v.word_group_id))]),
    supabase.from('units').select('id, name, sort_order'),
  ]);
  if (groupsError) throw groupsError;
  if (unitsError) throw unitsError;
  const groups = new Map(((groupRows ?? []) as WordGroupRow[]).map((g) => [g.id, g]));
  const units = new Map(((unitRows ?? []) as { id: string; name: string; sort_order: number }[]).map((u) => [u.id, u]));
  return { variants: variants.filter((v) => groups.has(v.word_group_id)), groups, units };
}

/** Unit, lesson, word, then form (primary → masculine → feminine → also heard) — the order an admin would work. */
function compareRows({ groups, units }: VariantContext, a: WordVariantRow, b: WordVariantRow): number {
  const ga = groups.get(a.word_group_id)!;
  const gb = groups.get(b.word_group_id)!;
  const ua = units.get(ga.unit_id)?.sort_order ?? 0;
  const ub = units.get(gb.unit_id)?.sort_order ?? 0;
  return (
    ua - ub ||
    ga.lesson_number - gb.lesson_number ||
    ga.sort_order - gb.sort_order ||
    ga.id.localeCompare(gb.id) ||
    (LABEL_RANK[a.variant_label] ?? 9) - (LABEL_RANK[b.variant_label] ?? 9) ||
    a.sort_order - b.sort_order ||
    a.id.localeCompare(b.id)
  );
}

function toItem({ groups, units }: VariantContext, row: WordVariantRow): ExplanationQueueItem {
  const group = groups.get(row.word_group_id)!;
  return {
    variant: mapWordVariant(row),
    englishMeaning: group.english_meaning,
    unitName: units.get(group.unit_id)?.name ?? '',
    lessonNumber: group.lesson_number,
  };
}

/**
 * Every word form (all variant labels) that still needs a native voice:
 * no recording, a recording whose Storage file doesn't exist, or a recording
 * not marked as a native voice. Archived/rejected content is left out.
 */
async function loadNeedingRecording(): Promise<{ item: RecordingQueueItem; skipped: boolean }[]> {
  const context = await loadVariantContext();
  const { variants } = context;
  if (variants.length === 0) return [];

  const existingFiles = await listExistingAudio(variants.map((v) => v.audio_path).filter((p): p is string => !!p));

  return variants
    .map((v) => {
      const reason: RecordingNeed | null = !v.audio_path
        ? 'no_audio'
        : !existingFiles.has(v.audio_path)
          ? 'missing_file'
          : !v.is_native_voice
            ? 'not_native'
            : null;
      return { row: v, reason };
    })
    .filter((x): x is { row: WordVariantRow; reason: RecordingNeed } => x.reason !== null)
    .sort((a, b) => compareRows(context, a.row, b.row))
    .map(({ row, reason }) => ({ skipped: !!row.recording_skipped_at, item: { ...toItem(context, row), reason } }));
}

/**
 * Native Recordings → Missing Explanations: forms that already have a
 * pronunciation recording but no explanation recording yet, in working order.
 */
export async function fetchMissingExplanations(): Promise<ExplanationQueueItem[]> {
  const context = await loadVariantContext();
  return context.variants
    .filter((v) => !!v.audio_path && !v.explanation_audio_path)
    .sort((a, b) => compareRows(context, a, b))
    .map((row) => toItem(context, row));
}

/**
 * Which of `paths` exist in the audio bucket — one listing per folder. A
 * folder that can't be listed is assumed fine (its files are treated as
 * present), so a network blip never floods the list with false "missing".
 */
async function listExistingAudio(paths: string[]): Promise<Set<string>> {
  const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  const folders = [...new Set(paths.map(folderOf))];
  const existing = new Set<string>();

  await Promise.all(
    folders.map(async (folder) => {
      const inFolder = paths.filter((p) => folderOf(p) === folder);
      try {
        const { data, error } = await supabase.storage.from(AUDIO_BUCKET).list(folder, { limit: 1000 });
        if (error || !data) throw error ?? new Error('no listing');
        const names = new Set((data as { name: string }[]).map((f) => (folder ? `${folder}/${f.name}` : f.name)));
        inFolder.filter((p) => names.has(p)).forEach((p) => existing.add(p));
      } catch {
        inFolder.forEach((p) => existing.add(p));
      }
    })
  );
  return existing;
}

/** Native Recordings: forms needing a voice, minus the skipped ones. */
export async function fetchRecordingQueue(): Promise<RecordingQueueItem[]> {
  return (await loadNeedingRecording()).filter((x) => !x.skipped).map((x) => x.item);
}

/** Skipped Recordings: skipped forms that still don't have a native voice. */
export async function fetchSkippedRecordings(): Promise<RecordingQueueItem[]> {
  return (await loadNeedingRecording()).filter((x) => x.skipped).map((x) => x.item);
}

/** Permanently skip a form (until restored or recorded). */
export function skipRecording(variantId: string, actorAccountId: string): Promise<WordVariant> {
  return updateWordVariant(variantId, { recordingSkipped: true }, actorAccountId);
}

/** Put a skipped form back on the Native Recordings list. */
export function restoreSkippedRecording(variantId: string, actorAccountId: string): Promise<WordVariant> {
  return updateWordVariant(variantId, { recordingSkipped: false }, actorAccountId);
}

/**
 * Saves a recording made in the Native Recordings flow with the existing
 * safe save (upload → save path → verify → only then delete the old file),
 * and in the same write marks it a native voice (which takes it off the
 * list), applies the Repeat After Me checkbox, and clears any skip.
 * Rejects on any failure — the caller must not move to the next word.
 */
export async function saveQueueRecording(options: {
  item: Pick<RecordingQueueItem, 'variant'>;
  localUri: string;
  /** Set for an uploaded file; omitted for a recording. */
  format?: AudioFormat;
  /** The optional explanation take ("Add explanation recording" ticked). */
  explanation?: { localUri: string; format?: AudioFormat };
  addToRepeatAfterMe: boolean;
  actorAccountId: string;
}): Promise<WordVariant> {
  const { item, localUri, format, explanation, addToRepeatAfterMe, actorAccountId } = options;
  const previousExplanation = item.variant.explanationAudioPath ?? null;
  let saved: WordVariant | null = null;

  // The explanation is uploaded first, as its own file. Nothing is written to
  // the database unless both uploads succeed — then both paths go in one write.
  let explanationPath: string | null = null;
  if (explanation) {
    try {
      explanationPath = await uploadWordVariantAudio(
        explanation.localUri,
        item.variant.wordGroupId,
        `${item.variant.id}-explanation`,
        explanation.format
      );
    } catch (err) {
      throw new Error(
        `Couldn’t upload the explanation recording (${err instanceof Error ? err.message : 'unknown error'}). Nothing was saved.`
      );
    }
  }

  try {
    await saveRecordedWordVariantAudio({
      localUri,
      format,
      wordGroupId: item.variant.wordGroupId,
      variantId: item.variant.id,
      previousPath: item.variant.audioPath,
      persistAudioPath: async (audioPath) => {
        const updated = await updateWordVariant(
          item.variant.id,
          {
            audioPath,
            ...(explanationPath ? { explanationAudioPath: explanationPath } : {}),
            isNativeVoice: true,
            inRepeatAfterMe: addToRepeatAfterMe,
            recordingSkipped: false,
          },
          actorAccountId
        );
        if (updated.inRepeatAfterMe !== addToRepeatAfterMe) {
          throw new Error('The Repeat After Me choice was not saved — has the 0012_repeat_after_me migration been applied?');
        }
        if (explanationPath && updated.explanationAudioPath !== explanationPath) {
          throw new Error('The explanation recording was not saved — has the 0016_explanation_audio migration been applied?');
        }
        saved = updated;
        return updated.audioPath;
      },
    });
  } catch (err) {
    // The old pronunciation/explanation are untouched; just drop the new
    // explanation file nothing points at.
    if (explanationPath) await deleteWordVariantAudio(explanationPath);
    throw err;
  }

  if (!saved) throw new Error('The recording was not saved.');
  if (explanationPath && previousExplanation && previousExplanation !== explanationPath) {
    await deleteWordVariantAudio(previousExplanation);
  }
  return saved;
}

/**
 * Missing Explanations: saves only the explanation recording, with the same
 * safe replace (upload → save path → verify → only then delete the old one).
 * Never touches the pronunciation or Repeat After Me.
 */
export async function saveQueueExplanation(options: {
  item: Pick<RecordingQueueItem, 'variant'>;
  localUri: string;
  format?: AudioFormat;
  actorAccountId: string;
}): Promise<WordVariant> {
  const { item, localUri, format, actorAccountId } = options;
  let saved: WordVariant | null = null;

  await saveRecordedWordVariantAudio({
    localUri,
    format,
    wordGroupId: item.variant.wordGroupId,
    variantId: `${item.variant.id}-explanation`,
    previousPath: item.variant.explanationAudioPath ?? null,
    persistAudioPath: async (explanationAudioPath) => {
      const updated = await updateWordVariant(item.variant.id, { explanationAudioPath }, actorAccountId);
      saved = updated;
      return updated.explanationAudioPath;
    },
  });

  if (!saved) throw new Error('The explanation recording was not saved.');
  return saved;
}
