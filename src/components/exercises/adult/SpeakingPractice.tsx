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
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';

import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { adultTrackSizing, colors, radii, spacing } from '@/constants/theme';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { isUsingMockAiProvider } from '@/lib/ai';
import { transcribeAudio } from '@/lib/ai/functionsClient';
import { isAnyVariantSpeechMatch } from '@/lib/wordVariants';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

type PermissionStage = 'checking' | 'needs-explanation' | 'requesting' | 'denied' | 'ready';
type RecordingStage = 'idle' | 'recording' | 'recorded';
// 'scoring' is only ever reached when a live AI provider is configured
// (isUsingMockAiProvider is false) — see the module doc comment below for
// why mock mode never attempts this.
type CheckStage = 'idle' | 'checking' | 'correct' | 'incorrect' | 'exhausted' | 'check-failed';

const MAX_ATTEMPTS = 3;

interface SpeakingPracticeProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/**
 * Adult/teen track: hear the native word, record yourself saying it, play
 * your recording back to compare.
 *
 * Automated pronunciation scoring only runs when a live AI provider is
 * configured (EXPO_PUBLIC_TALK_AI_MODE=live) — the same gate the "Talk to a
 * Tunisian" voice input uses. Whisper (the model behind this app's STT) has
 * no dedicated Tunisian Derja mode, so its accuracy here is genuinely
 * unproven; in mock mode (the default, no AI provider configured) this falls
 * back to the original self-comparison-only behavior, so the exercise still
 * works out of the box. When scoring is active: up to 3 attempts, matched
 * against any variant in the word group (not just the one played, mirroring
 * how every other exercise type checks answers); a technical failure to
 * reach the STT service never blocks progress, and running out of attempts
 * still counts as correct — this is spoken self-practice, not a gate, so a
 * likely recognition miss shouldn't cost mastery/spaced-repetition standing.
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
  const [checkStage, setCheckStage] = useState<CheckStage>('idle');
  const [attemptCount, setAttemptCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const recordingPlayer = useAudioPlayer(null);
  const recordingPlayerStatus = useAudioPlayerStatus(recordingPlayer);
  const { playCorrect, playIncorrect } = useAnswerFeedback();

  // A slow breathing pulse on the record button while it's actively
  // recording, so "live" is obvious at a glance rather than just a red dot.
  const recordPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (recordingStage !== 'recording') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(recordPulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recordingStage, recordPulse]);

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
      Haptics.selectionAsync();
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
      Haptics.selectionAsync();
      setRecordingStage('recorded');
      setCheckStage('idle');
    } catch {
      setErrorMessage("Couldn't finish recording. Give it another try.");
      setRecordingStage('idle');
    } finally {
      setIsBusy(false);
    }
  };

  const tryAgain = () => {
    setErrorMessage(null);
    setCheckStage('idle');
    setRecordingStage('idle');
  };

  const playRecording = () => {
    try {
      recordingPlayer.seekTo(0).then(() => recordingPlayer.play());
    } catch {
      setErrorMessage("Couldn't play that back — try recording again.");
    }
  };

  const checkPronunciation = async () => {
    if (!recorder.uri || isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);
    setCheckStage('checking');
    try {
      const file = new File(recorder.uri);
      const bytes = await file.bytes();
      const result = await transcribeAudio(bytes, 'audio/m4a');
      if (!result.ok) {
        setCheckStage('check-failed');
        return;
      }

      const nextAttemptCount = attemptCount + 1;
      setAttemptCount(nextAttemptCount);

      if (isAnyVariantSpeechMatch(exercise.targetGroup, result.text)) {
        playCorrect();
        setCheckStage('correct');
      } else if (nextAttemptCount >= MAX_ATTEMPTS) {
        setCheckStage('exhausted');
      } else {
        playIncorrect();
        setCheckStage('incorrect');
      }
    } catch {
      setCheckStage('check-failed');
    } finally {
      setIsBusy(false);
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

  const scoringActive = !isUsingMockAiProvider;
  const isChecking = checkStage === 'checking';

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
        <Animated.View
          style={{ transform: [{ scale: recordPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}
        >
          <PressableScale
            onPress={stopRecording}
            disabled={isBusy}
            style={[styles.recordButton, styles.recordButtonActive]}
            accessibilityLabel="Stop recording"
          >
            <View style={styles.stopSquare} />
          </PressableScale>
        </Animated.View>
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

      {recordingStage === 'recorded' && scoringActive && checkStage === 'incorrect' ? (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackText}>Not quite — give it another try.</Text>
          <Text style={styles.attemptText}>
            Attempt {attemptCount} of {MAX_ATTEMPTS}
          </Text>
        </View>
      ) : null}

      {recordingStage === 'recorded' && scoringActive && checkStage === 'correct' ? (
        <View style={[styles.feedbackBanner, styles.feedbackBannerCorrect]}>
          <Text style={[styles.feedbackText, styles.feedbackTextCorrect]}>Nice! That sounds right.</Text>
        </View>
      ) : null}

      {recordingStage === 'recorded' && scoringActive && checkStage === 'exhausted' ? (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackText}>No worries — here&apos;s how it&apos;s said.</Text>
        </View>
      ) : null}

      {recordingStage === 'recorded' && scoringActive && checkStage === 'check-failed' ? (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackText}>Couldn&apos;t check that this time — you can keep going.</Text>
        </View>
      ) : null}

      {recordingStage === 'recorded' ? (
        <View style={styles.actionsRow}>
          {!scoringActive ? (
            <>
              <Button label="Try again" variant="secondary" onPress={tryAgain} style={{ flex: 1 }} />
              <Button label="Continue" onPress={() => onComplete(true)} style={{ flex: 1 }} />
            </>
          ) : checkStage === 'idle' || checkStage === 'checking' ? (
            <>
              <Button label="Try again" variant="secondary" onPress={tryAgain} disabled={isChecking} style={{ flex: 1 }} />
              <Button
                label="Check pronunciation"
                onPress={checkPronunciation}
                loading={isChecking}
                style={{ flex: 1 }}
              />
            </>
          ) : checkStage === 'incorrect' ? (
            <Button label="Record again" onPress={tryAgain} style={{ flex: 1 }} />
          ) : (
            // 'correct' | 'exhausted' | 'check-failed'
            <Button label="Continue" onPress={() => onComplete(true)} style={{ flex: 1 }} />
          )}
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
  feedbackBanner: {
    marginTop: spacing.lg,
    width: '100%',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#FBEAE6',
    alignItems: 'center',
  },
  feedbackBannerCorrect: { backgroundColor: '#E3F5EA' },
  feedbackText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  feedbackTextCorrect: { color: '#2E9F68' },
  attemptText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, width: '100%' },
});
