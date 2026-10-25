import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { saveQueueRecording, type RecordingNeed, type RecordingQueueItem } from '@/data/admin/recordingQueue';
import { useAdminAudioRecorder } from '@/hooks/useAdminAudioRecorder';
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

interface RecordingStationProps {
  item: RecordingQueueItem;
  actorAccountId: string;
  /** Called with the saved form once the recording is durably saved. */
  onSaved: (variant: WordVariant) => void;
  /** Omit where skipping makes no sense (the Skipped Recordings list). */
  onSkip?: () => void;
  /** Disables Skip while the screen is saving the skip. */
  isSkipping?: boolean;
}

/**
 * One word form in the admin Native Recordings flow: record, listen back,
 * record again if needed, then Save & next. "Add to Repeat After Me" is ticked
 * by default. A failed save shows the error and stays on the word.
 */
export function RecordingStation({ item, actorAccountId, onSaved, onSkip, isSkipping = false }: RecordingStationProps) {
  const recorder = useAdminAudioRecorder();
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [addToRepeatAfterMe, setAddToRepeatAfterMe] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    if (recorder.permission === 'needs-explanation') recorder.requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRecording = async () => {
    setError(null);
    if (recorder.isRecording) {
      const uri = await recorder.stop();
      if (uri) setRecordedUri(uri);
      else setError("That recording didn't save — try again.");
      return;
    }
    setRecordedUri(null);
    try {
      await recorder.start();
    } catch {
      setError("Couldn't start recording — check microphone access.");
    }
  };

  const playRecording = () => {
    if (!recordedUri) return;
    player.replace({ uri: recordedUri });
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => setError("Couldn't play the recording back."));
  };

  const save = async () => {
    if (!recordedUri || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveQueueRecording({ item, localUri: recordedUri, addToRepeatAfterMe, actorAccountId });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the recording.');
      setIsSaving(false);
    }
  };

  const { variant } = item;

  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.badges}>
        <Text style={styles.badge}>{FORM_LABEL[variant.variantLabel]}</Text>
        <Text style={[styles.badge, styles.needBadge]}>{NEED_LABEL[item.reason]}</Text>
      </View>
      <Text style={styles.meaning}>{item.englishMeaning}</Text>
      <Text style={styles.arabic}>{variant.wordArabic}</Text>
      <Text style={styles.transliteration}>{variant.transliteration}</Text>
      <Text style={styles.context}>
        {item.unitName} · Lesson {item.lessonNumber}
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {recorder.permission === 'denied' ? (
        <Text style={styles.errorText}>Microphone access is off — turn it on in Settings to record.</Text>
      ) : recordedUri && !recorder.isRecording ? (
        <>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button label={playerStatus.playing ? '⏸ Playing…' : '▶ Play recording'} variant="secondary" onPress={playRecording} />
            </View>
            <View style={styles.cell}>
              <Button label="Record again" variant="ghost" onPress={() => setRecordedUri(null)} disabled={isSaving} />
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

          <Button label="Save & next" onPress={save} loading={isSaving} />
        </>
      ) : (
        <Button
          label={recorder.isRecording ? `■ Stop (${Math.floor(recorder.durationMillis / 1000)}s)` : '● Record'}
          variant={recorder.isRecording ? 'primary' : 'secondary'}
          onPress={toggleRecording}
        />
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
