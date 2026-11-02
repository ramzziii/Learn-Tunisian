// The recording sheet: every approved form that still has no native
// recording, in working order (unit, lesson, word, form), with the exact file
// name to save each recording as — so a native speaker can record in one
// sitting and upload-audio picks the files up by name.
import { hasNativeAudio } from './audio.mjs';
import { contentOrder } from './review.mjs';
import { audioFileName } from './validate.mjs';

export const RECORDING_COLUMNS = ['order', 'unit', 'lesson_number', 'word_group_id', 'variant_label', 'english_meaning', 'word_arabic', 'transliteration', 'file_name'];

export function buildRecordingList(snapshot) {
  const units = new Map(snapshot.units.map((u) => [u.id, u]));
  const groups = new Map(snapshot.word_groups.map((g) => [g.id, g]));
  const usable = (g) => g && g.content_status !== 'rejected' && g.content_status !== 'archived';
  const rows = snapshot.word_variants
    .filter((v) => v.content_status === 'approved' && !hasNativeAudio(v) && usable(groups.get(v.word_group_id)))
    .sort(contentOrder(snapshot))
    .map((v, i) => {
      const g = groups.get(v.word_group_id);
      return {
        order: String(i + 1),
        unit: units.get(g.unit_id)?.name ?? '',
        lesson_number: String(g.lesson_number),
        word_group_id: g.id,
        variant_label: v.variant_label,
        english_meaning: g.english_meaning,
        word_arabic: v.word_arabic,
        transliteration: v.transliteration,
        file_name: audioFileName(g.id, v.variant_label),
      };
    });
  const awaitingReview = snapshot.word_variants.filter((v) => v.content_status === 'draft' || v.content_status === 'pending_review').length;
  return { rows, awaitingReview };
}
