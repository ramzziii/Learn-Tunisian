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
import { Text, View, StyleSheet } from 'react-native';

import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
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
  const {
    play: playNative,
    hasAudio,
    isResolving,
    hasError: nativeAudioHasError,
    retry: retryNativeAudio,
  } = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true });
  const [permissionStage, setPermissionStage] = useState<PermissionStage>('checking');
  const [recordingStage, setRecordingStage] = useState<RecordingStage>('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const { status } = await requestRecordingPermissionsAsync();
      setPermissionStage(status === 'granted' ? 'ready' : 'denied');
    } catch {
      setPermissionStage('denied');
    }
  };

  const startRecording = async () => {
    if (isBusy) return; // guards against a rapid double-tap firing two recordings
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingStage('recording');
    } catch {
      setErrorMessage("Couldn't start recording. Give it another try.");
    } finally {
      setIsBusy(false);
    }
  };

  const stopRecording = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await recorder.stop();
      if (!recorder.uri) {
        setErrorMessage("That recording didn't save properly. Give it another try.");
        setRecordingStage('idle');
        return;
      }
      recordingPlayer.replace({ uri: recorder.uri });
      setRecordingStage('recorded');
    } catch {
      setErrorMessage("Couldn't finish recording. Give it another try.");
      setRecordingStage('idle');
    } finally {
      setIsBusy(false);
    }
  };

  const tryAgain = () => {
    setErrorMessage(null);
    setRecordingStage('idle');
  };

  const playRecording = () => {
    try {
      recordingPlayer.seekTo(0).then(() => recordingPlayer.play());
    } catch {
      setErrorMessage("Couldn't play that back — try recording again.");
    }
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
        <AudioPlayButton
          onPress={playNative}
          hasAudio={hasAudio}
          isResolving={isResolving}
          hasError={nativeAudioHasError}
          onRetry={retryNativeAudio}
          style={{ marginTop: spacing.lg }}
        />
        <Button label="Continue" onPress={() => onComplete(true)} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AudioPlayButton
        onPress={playNative}
        hasAudio={hasAudio}
        isResolving={isResolving}
        hasError={nativeAudioHasError}
        onRetry={retryNativeAudio}
      />
      <Text style={styles.instructions}>Listen, then record yourself saying it</Text>
      <VariantCallout group={exercise.targetGroup} />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {recordingStage === 'idle' ? (
        <PressableScale
          onPress={startRecording}
          disabled={isBusy}
          style={[styles.recordButton, isBusy && styles.disabled]}
          accessibilityLabel="Start recording"
        >
          <View style={styles.recordDot} />
        </PressableScale>
      ) : null}

      {recordingStage === 'recording' ? (
        <PressableScale
          onPress={stopRecording}
          disabled={isBusy}
          style={[styles.recordButton, styles.recordButtonActive]}
          accessibilityLabel="Stop recording"
        >
          <View style={styles.stopSquare} />
        </PressableScale>
      ) : null}
      {recordingStage === 'recording' ? (
        <Text style={styles.recordingTime}>{(recorderState.durationMillis / 1000).toFixed(1)}s</Text>
      ) : null}

      {recordingStage === 'recorded' ? (
        <View style={styles.recordedRow}>
          <PressableScale onPress={playRecording} style={styles.playbackButton}>
            <Text style={styles.playbackIcon}>{recordingPlayerStatus.playing ? '⏸' : '▶️'}</Text>
            <Text style={styles.playbackLabel}>Your recording</Text>
          </PressableScale>
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
  disabled: { opacity: 0.5 },
  instructions: {
    fontSize: adultTrackSizing.bodyFontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  errorText: { fontSize: 13, color: colors.error, textAlign: 'center', marginBottom: spacing.sm },
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
