// 0028: a recording whose spelling changed waits for an admin or reviewer to
// confirm it. Learner data treats it as no recording at all (never played,
// never in an exercise or Repeat After Me); admin data keeps the file.
import { mapLearnerWordVariant, mapWordVariant } from '@/data/mappers';
import { isListenableVariant } from '@/lib/listening';
import type { WordVariantRow } from '@/types/database';

const row = (recheck: boolean): WordVariantRow => ({
  id: 'v1', word_group_id: 'g1', variant_label: 'primary', word_arabic: 'كملت', transliteration: 'kamelt',
  audio_path: 'g1/v1.m4a', notes: null, sort_order: 0, native_verified: true, content_status: 'approved',
  created_by: null, updated_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  speaker_name: null, dialect_notes: null, is_native_voice: true, in_repeat_after_me: true,
  recording_skipped_at: null, recording_skipped_by: null, approved_by: null, approved_at: null,
  audio_needs_recheck: recheck,
});

it('learners: a recording that needs re-check has no audio, so nothing plays it or lists it', () => {
  const v = mapLearnerWordVariant(row(true));
  expect(v.audioPath).toBeNull();
  expect(v.audioNeedsRecheck).toBe(true);
  expect(isListenableVariant(v)).toBe(false);
});

it('learners: a confirmed recording is unchanged', () => {
  const v = mapLearnerWordVariant(row(false));
  expect(v.audioPath).toBe('g1/v1.m4a');
  expect(isListenableVariant(v)).toBe(true);
});

it('admins keep the file, flagged, so it can be listened to and confirmed', () => {
  const v = mapWordVariant(row(true));
  expect(v.audioPath).toBe('g1/v1.m4a');
  expect(v.audioNeedsRecheck).toBe(true);
});
