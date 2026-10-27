import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import {
  saveQueueExplanation,
  saveQueueRecording,
  type ExplanationQueueItem,
  type RecordingNeed,
  type RecordingQueueItem,
} from '@/data/admin/recordingQueue';
import { useAdminAudioRecorder } from '@/hooks/useAdminAudioRecorder';
import { pickAudioFile, type PickedAudioFile } from '@/lib/admin/audioFile';
import { getAudioUrl } from '@/lib/supabase/client';
import type { VariantLabel, WordVariant } from '@/types/models';

const FORM_LABEL: Record<VariantLabel, string> = {
  primary: 'Primary',
  also_heard: 'Also heard',
  masculine: 'Masculine',
  feminine: 'Feminine',
};

const NEED_LABEL: Record<RecordingNeed, string> = {
  no_audio: 'No recording yet',
  missing_file: 'Recording file is missing',
  not_native: 'Not a native voice yet',
};

/** A take waiting to be saved: a recording's URI, or a picked file. */
interface Take {
  uri: string;
  file: PickedAudioFile | null;
}

type StationProps = {
  actorAccountId: string;
  /** Called with the saved form once the recording(s) are durably saved. */
  onSaved: (variant: WordVariant) => void;
  /** Omit where skipping makes no sense (the Skipped Recordings list). */
  onSkip?: () => void;
  /** Disables Skip while the screen is saving the skip. */
  isSkipping?: boolean;
} & (
  | { mode?: 'pronunciation'; item: RecordingQueueItem }
  /** Missing Explanations: the pronunciation exists; record only the explanation. */
  | { mode: 'explanation'; item: ExplanationQueueItem }
);

/**
 * One word form in the admin Native Recordings flow: record (or upload an
 * audio file — no microphone needed), listen back, redo if needed, then
 * Save & next. "Add to Repeat After Me" is ticked by default.
 *
 * Alongside the pronunciation there's an optional *explanation* recording
 * (a native speaker explaining it in English, Arabic or both) — its own
 * take, its own playback, saved to its own column, never part of Repeat
 * After Me. "Add explanation recording" is ticked by default; untick it to
 * save the pronunciation alone. In `mode="explanation"` (Missing
 * Explanations) only the explanation is recorded. A failed save shows the
 * error and stays on the word with both takes kept.
 */
export function RecordingStation(props: StationProps) {
  const { item, actorAccountId, onSaved, onSkip, isSkipping = false } = props;
  const explanationOnly = props.mode === 'explanation';
  const { variant } = item;
  const hasExistingExplanation = !!variant.explanationAudioPath;

  const recorder = useAdminAudioRecorder();
  const [recordingTarget, setRecordingTarget] = useState<'pronunciation' | 'explanation' | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  // Set when recordedUri came from Upload audio rather than the recorder.
  const [pickedFile, setPickedFile] = useState<PickedAudioFile | null>(null);
  const [explanationTake, setExplanationTake] = useState<Take | null>(null);
  const [includeExplanation, setIncludeExplanation] = useState(!hasExistingExplanation);
  const [addToRepeatAfterMe, setAddToRepeatAfterMe] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    if (recorder.permission === 'needs-explanation') recorder.requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const micDenied = recorder.permission === 'denied';
  const recordingPronunciation = recorder.isRecording && recordingTarget === 'pronunciation';
  const recordingExplanation = recorder.isRecording && recordingTarget === 'explanation';

  const toggleRecording = async (target: 'pronunciation' | 'explanation') => {
    setError(null);
    if (recorder.isRecording) {
      const uri = await recorder.stop();
      const stoppedTarget = recordingTarget;
      setRecordingTarget(null);
      if (!uri) {
        setError("That recording didn't save — try again.");
        return;
      }
      if (stoppedTarget === 'explanation') {
        setExplanationTake({ uri, file: null });
      } else {
        setRecordedUri(uri);
        setPickedFile(null);
      }
      return;
    }
    if (target === 'pronunciation') {
      setRecordedUri(null);
      setPickedFile(null);
    } else {
      setExplanationTake(null);
    }
    setRecordingTarget(target);
    try {
      await recorder.start();
    } catch {
      setRecordingTarget(null);
      setError("Couldn't start recording — check microphone access.");
    }
  };

  const pick = async (): Promise<PickedAudioFile | null> => {
    setError(null);
    const result = await pickAudioFile();
    if (result.kind === 'canceled') return null;
    if (result.kind === 'invalid') {
      setError(result.message);
      return null;
    }
    return result.file;
  };

  const uploadFile = async () => {
    const file = await pick();
    if (!file) return;
    setRecordedUri(file.uri);
    setPickedFile(file);
  };

  const uploadExplanation = async () => {
    const file = await pick();
    if (file) setExplanationTake({ uri: file.uri, file });
  };

  const discardTake = () => {
    setRecordedUri(null);
    setPickedFile(null);
  };

  const playUri = (uri: string | null, failure: string) => {
    if (!uri) return;
    player.replace({ uri });
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => setError(failure));
  };

  const explanationPayload = () =>
    explanationTake
      ? { localUri: explanationTake.uri, ...(explanationTake.file ? { format: explanationTake.file.format } : {}) }
      : null;

  const save = async () => {
    if (!recordedUri || isSaving) return;
    if (includeExplanation && !explanationTake) {
      setError(
        `Record or upload the explanation, or untick “${hasExistingExplanation ? 'Replace' : 'Add'} explanation recording”.`
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    const explanation = includeExplanation ? explanationPayload() : null;
    try {
      const saved = await saveQueueRecording({
        item,
        localUri: recordedUri,
        ...(pickedFile ? { format: pickedFile.format } : {}),
        ...(explanation ? { explanation } : {}),
        addToRepeatAfterMe,
        actorAccountId,
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recording.');
      setIsSaving(false);
    }
  };

  const saveExplanationOnly = async () => {
    if (isSaving) return;
    const explanation = explanationPayload();
    if (!explanation) {
      setError('Record or upload the explanation first.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveQueueExplanation({ item, ...explanation, actorAccountId });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the explanation recording.');
      setIsSaving(false);
    }
  };

  const explanationControls = (
    <View style={styles.explanationBox}>
      {explanationTake ? (
        <>
          {explanationTake.file ? <Text style={styles.context}>Selected file: {explanationTake.file.name}</Text> : null}
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button
                label="▶ Play explanation"
                variant="secondary"
                onPress={() => playUri(explanationTake.uri, "Couldn't play the explanation back.")}
              />
            </View>
            <View style={styles.cell}>
              <Button label="Redo explanation" variant="ghost" onPress={() => setExplanationTake(null)} disabled={isSaving} />
            </View>
          </View>
        </>
      ) : (
        <>
          {micDenied ? (
            <Text style={styles.errorText}>Microphone access is off — upload the explanation as a file instead.</Text>
          ) : (
            <Button
              label={
                recordingExplanation
                  ? `■ Stop explanation (${Math.floor(recorder.durationMillis / 1000)}s)`
                  : '● Record explanation'
              }
              variant={recordingExplanation ? 'primary' : 'secondary'}
              onPress={() => toggleRecording('explanation')}
              disabled={recordingPronunciation}
            />
          )}
          {recorder.isRecording ? null : <Button label="Upload explanation" variant="ghost" onPress={uploadExplanation} />}
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.badges}>
        <Text style={styles.badge}>{FORM_LABEL[variant.variantLabel]}</Text>
        {explanationOnly ? (
          <Text style={[styles.badge, styles.needBadge]}>No explanation</Text>
        ) : (
          <>
            <Text style={[styles.badge, styles.needBadge]}>{NEED_LABEL[(item as RecordingQueueItem).reason]}</Text>
            {hasExistingExplanation ? null : <Text style={[styles.badge, styles.mutedBadge]}>No explanation yet</Text>}
          </>
        )}
      </View>
      <Text style={styles.meaning}>{item.englishMeaning}</Text>
      <Text style={styles.arabic}>{variant.wordArabic}</Text>
      <Text style={styles.transliteration}>{variant.transliteration}</Text>
      <Text style={styles.context}>
        {item.unitName} · Lesson {item.lessonNumber}
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {explanationOnly ? (
        <>
          <Button
            label="▶ Play pronunciation"
            variant="ghost"
            onPress={() => playUri(getAudioUrl(variant.audioPath, variant.updatedAt), "Couldn't play the pronunciation.")}
          />
          <Text style={styles.sectionLabel}>Explanation recording</Text>
          <Text style={styles.context}>A native speaker explaining it — in English, Arabic, or both.</Text>
          {explanationControls}
          <Button label="Save explanation & next" onPress={saveExplanationOnly} loading={isSaving} />
        </>
      ) : recordedUri && !recordingPronunciation ? (
        <>
          <Text style={styles.sectionLabel}>Pronunciation recording</Text>
          {pickedFile ? <Text style={styles.context}>Selected file: {pickedFile.name}</Text> : null}
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button
                label={playerStatus.playing ? '⏸ Playing…' : pickedFile ? '▶ Play file' : '▶ Play recording'}
                variant="secondary"
                onPress={() => playUri(recordedUri, "Couldn't play the recording back.")}
              />
            </View>
            <View style={styles.cell}>
              <Button
                label={pickedFile ? 'Choose another file' : 'Record again'}
                variant="ghost"
                onPress={discardTake}
                disabled={isSaving || recorder.isRecording}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Add to Repeat After Me"
            accessibilityState={{ checked: addToRepeatAfterMe }}
            onPress={() => setAddToRepeatAfterMe((v) => !v)}
            style={styles.checkboxRow}
            hitSlop={8}
          >
            <View style={[styles.checkbox, addToRepeatAfterMe && styles.checkboxChecked]}>
              {addToRepeatAfterMe ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.checkboxLabel}>Add to Repeat After Me</Text>
          </Pressable>

          {hasExistingExplanation ? <Text style={styles.context}>This word already has an explanation recording.</Text> : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={hasExistingExplanation ? 'Replace explanation recording' : 'Add explanation recording'}
            accessibilityState={{ checked: includeExplanation }}
            onPress={() => setIncludeExplanation((v) => !v)}
            style={styles.checkboxRow}
            hitSlop={8}
          >
            <View style={[styles.checkbox, includeExplanation && styles.checkboxChecked]}>
              {includeExplanation ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.checkboxLabel}>
              {hasExistingExplanation ? 'Replace explanation recording' : 'Add explanation recording'}
            </Text>
          </Pressable>
          {includeExplanation ? (
            <>
              <Text style={styles.context}>A native speaker explaining it — in English, Arabic, or both. Not used in Repeat After Me.</Text>
              {explanationControls}
            </>
          ) : null}

          <Button label="Save & next" onPress={save} loading={isSaving} disabled={recorder.isRecording} />
        </>
      ) : (
        <>
          {micDenied ? (
            <Text style={styles.errorText}>
              Microphone access is off — turn it on in Settings to record, or upload an audio file instead.
            </Text>
          ) : (
            <Button
              label={recordingPronunciation ? `■ Stop (${Math.floor(recorder.durationMillis / 1000)}s)` : '● Record'}
              variant={recordingPronunciation ? 'primary' : 'secondary'}
              onPress={() => toggleRecording('pronunciation')}
            />
          )}
          {recorder.isRecording ? null : <Button label="Upload audio" variant="ghost" onPress={uploadFile} />}
        </>
      )}

      {onSkip ? (
        <Button label="Skip" variant="ghost" onPress={onSkip} disabled={isSaving || isSkipping || recorder.isRecording} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  badges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: `${colors.primary}14`,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  needBadge: { color: colors.error, backgroundColor: `${colors.error}14` },
  mutedBadge: { color: colors.textSecondary, backgroundColor: `${colors.textSecondary}14` },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', marginTop: spacing.xs },
  explanationBox: { gap: spacing.xs },
  meaning: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  arabic: { fontSize: 32, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
  transliteration: { fontSize: 17, color: colors.textSecondary, textAlign: 'center', fontStyle: 'italic' },
  context: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
  errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, minWidth: 0 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkmark: { color: colors.textOnPrimary, fontSize: 15, fontWeight: '800' },
  checkboxLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
});
