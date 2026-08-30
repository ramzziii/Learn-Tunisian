import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { Button } from '@/components/ui/Button';
import { adultTrackSizing, colors, radii, spacing } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

type PermissionStage = 'checking' | 'needs-explanation' | 'requesting' | 'denied' | 'ready';
type RecordingStage = 'idle' | 'recording' | 'recorded';

interface SpeakingPracticeProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/**
 * Adult/teen track: hear the native word, record yourself saying it, play
 * your recording back to compare. No automated pronunciation scoring — this
 * is self-comparison only, so completing it (with or without a recording)
 * always counts as correct.
 */
export function SpeakingPractice({ exercise, onComplete }: SpeakingPracticeProps) {
  const { play: playNative, hasAudio } = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true });
  const [permissionStage, setPermissionStage] = useState<PermissionStage>('checking');
  const [recordingStage, setRecordingStage] = useState<RecordingStage>('idle');

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const recordingPlayer = useAudioPlayer(null);
  const recordingPlayerStatus = useAudioPlayerStatus(recordingPlayer);

  useEffect(() => {
    getRecordingPermissionsAsync().then(({ status }) => {
      setPermissionStage(status === 'granted' ? 'ready' : status === 'denied' ? 'denied' : 'needs-explanation');
    });
  }, []);

  const requestPermission = async () => {
    setPermissionStage('requesting');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const { status } = await requestRecordingPermissionsAsync();
    setPermissionStage(status === 'granted' ? 'ready' : 'denied');
  };

  const startRecording = async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingStage('recording');
  };

  const stopRecording = async () => {
    await recorder.stop();
    if (recorder.uri) recordingPlayer.replace({ uri: recorder.uri });
    setRecordingStage('recorded');
  };

  const tryAgain = () => setRecordingStage('idle');

  const playRecording = () => {
    recordingPlayer.seekTo(0).then(() => recordingPlayer.play());
  };

  if (permissionStage === 'checking' || permissionStage === 'requesting') {
    return (
      <View style={styles.container}>
        <Text style={styles.instructions}>Checking microphone access…</Text>
      </View>
    );
  }

  if (permissionStage === 'needs-explanation') {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionEmoji}>🎙️</Text>
        <Text style={styles.permissionTitle}>Practice speaking</Text>
        <Text style={styles.permissionBody}>
          We&apos;ll use your microphone so you can record yourself saying this word and play it back to compare —
          just for you, never scored or sent anywhere.
        </Text>
        <Button label="Allow microphone access" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  if (permissionStage === 'denied') {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionEmoji}>🔇</Text>
        <Text style={styles.permissionTitle}>Microphone unavailable</Text>
        <Text style={styles.permissionBody}>
          You can still hear the word below. Turn on microphone access in your device Settings if you&apos;d like to
          practice speaking it.
        </Text>
        <Pressable onPress={playNative} disabled={!hasAudio} style={[styles.playButton, !hasAudio && styles.disabled]}>
          <Text style={styles.playIcon}>🔊</Text>
        </Pressable>
        <Button label="Continue" onPress={() => onComplete(true)} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={playNative} disabled={!hasAudio} style={[styles.playButton, !hasAudio && styles.disabled]}>
        <Text style={styles.playIcon}>🔊</Text>
      </Pressable>
      <Text style={styles.instructions}>Listen, then record yourself saying it</Text>
      <VariantCallout group={exercise.targetGroup} />

      {recordingStage === 'idle' ? (
        <Pressable onPress={startRecording} style={styles.recordButton} accessibilityLabel="Start recording">
          <View style={styles.recordDot} />
        </Pressable>
      ) : null}

      {recordingStage === 'recording' ? (
        <Pressable onPress={stopRecording} style={[styles.recordButton, styles.recordButtonActive]}>
          <View style={styles.stopSquare} />
        </Pressable>
      ) : null}
      {recordingStage === 'recording' ? (
        <Text style={styles.recordingTime}>{(recorderState.durationMillis / 1000).toFixed(1)}s</Text>
      ) : null}

      {recordingStage === 'recorded' ? (
        <View style={styles.recordedRow}>
          <Pressable onPress={playRecording} style={styles.playbackButton}>
            <Text style={styles.playbackIcon}>{recordingPlayerStatus.playing ? '⏸' : '▶️'}</Text>
            <Text style={styles.playbackLabel}>Your recording</Text>
          </Pressable>
        </View>
      ) : null}

      {recordingStage === 'recorded' ? (
        <View style={styles.actionsRow}>
          <Button label="Try again" variant="secondary" onPress={tryAgain} style={{ flex: 1 }} />
          <Button label="Continue" onPress={() => onComplete(true)} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  disabled: { opacity: 0.4 },
  playIcon: { fontSize: 28 },
  instructions: {
    fontSize: adultTrackSizing.bodyFontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  permissionEmoji: { fontSize: 48, marginTop: spacing.xl },
  permissionTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  permissionBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  recordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  recordButtonActive: { backgroundColor: '#FBEAE6' },
  recordDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.error },
  stopSquare: { width: 32, height: 32, borderRadius: radii.sm, backgroundColor: colors.error },
  recordingTime: { fontSize: 16, color: colors.textSecondary, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  recordedRow: { marginTop: spacing.xl, width: '100%', alignItems: 'center' },
  playbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  playbackIcon: { fontSize: 20 },
  playbackLabel: { fontSize: 16, fontWeight: '600', color: colors.primary },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, width: '100%' },
});
