import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingStatus,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import type { RepeatAfterMeItem } from '@/data/repeatAfterMe';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useTheme } from '@/lib/theme/ThemeContext';

type PermissionStage = 'checking' | 'needs-explanation' | 'requesting' | 'denied' | 'ready';
type RecordingStage = 'idle' | 'recording' | 'recorded';

interface RepeatAfterMeExerciseProps {
  item: RepeatAfterMeItem;
  /** Attempts already used on this item (practice pass). */
  attemptsUsed: number;
  maxAttempts: number;
  /** The end-of-session single extra try. */
  isReview: boolean;
  /** 'missed' after the last practice attempt — show "revisit later" + Continue. */
  notice: 'missed' | null;
  onAssess: (gotIt: boolean) => void;
  onContinue: () => void;
}

/**
 * One Repeat After Me item: hear the admin's recording (never the generated
 * voice), record yourself, play it back to compare, then say whether you got
 * it. No automatic scoring. The learner's recording is deleted as soon as
 * they've assessed it (or leave the item) — nothing of theirs is kept.
 * Permission handling mirrors the speaking exercise; with the microphone
 * off, the learner can still listen, say it aloud, and self-assess.
 */
export function RepeatAfterMeExercise({
  item,
  attemptsUsed,
  maxAttempts,
  isReview,
  notice,
  onAssess,
  onContinue,
}: RepeatAfterMeExerciseProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const original = useWordAudioPlayer(item.variant, { autoPlay: true, fallbackVoice: false });

  const [permissionStage, setPermissionStage] = useState<PermissionStage>('checking');
  const [recordingStage, setRecordingStage] = useState<RecordingStage>('idle');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingStageRef = useRef<RecordingStage>('idle');
  recordingStageRef.current = recordingStage;
  const recordedUriRef = useRef<string | null>(null);
  recordedUriRef.current = recordedUri;

  const discardFile = useCallback((uri: string | null) => {
    if (!uri || Platform.OS === 'web') return; // web recordings are in-memory blobs
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Best-effort: the OS may already have cleared its cache.
    }
  }, []);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status: RecordingStatus) => {
    // An interruption (call, another app taking audio, media services
    // reset) mid-recording: discard the partial take, don't count it.
    if (status.hasError && recordingStageRef.current === 'recording') {
      recorder.stop().catch(() => {});
      discardFile(recorder.uri);
      setRecordingStage('idle');
      setErrorMessage('Recording was interrupted — please try again.');
    }
  });
  const recorderState = useAudioRecorderState(recorder, 100);
  const ownPlayer = useAudioPlayer(null);
  const ownPlayerStatus = useAudioPlayerStatus(ownPlayer);

  useEffect(() => {
    getRecordingPermissionsAsync()
      .then(({ status }) =>
        setPermissionStage(status === 'granted' ? 'ready' : status === 'denied' ? 'denied' : 'needs-explanation')
      )
      .catch(() => setPermissionStage('needs-explanation'));
  }, []);

  // Leaving the item (next item, exit, unmount) never keeps learner audio.
  useEffect(
    () => () => {
      if (recordingStageRef.current === 'recording') recorder.stop().catch(() => {});
      discardFile(recordedUriRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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
    if (isBusy) return;
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
        setErrorMessage("That recording didn't save — give it another try.");
        setRecordingStage('idle');
        return;
      }
      setRecordedUri(recorder.uri);
      setRecordingStage('recorded');
    } catch {
      setErrorMessage("That recording didn't save — give it another try.");
      setRecordingStage('idle');
    } finally {
      setIsBusy(false);
    }
  };

  const playOwnRecording = () => {
    if (!recordedUri) return;
    try {
      ownPlayer.replace({ uri: recordedUri });
      ownPlayer
        .seekTo(0)
        .then(() => ownPlayer.play())
        .catch(() => setErrorMessage("Couldn't play your recording back — try recording again."));
    } catch {
      setErrorMessage("Couldn't play your recording back — try recording again.");
    }
  };

  const assess = (gotIt: boolean) => {
    discardFile(recordedUri);
    setRecordedUri(null);
    setRecordingStage('idle');
    setErrorMessage(null);
    onAssess(gotIt);
  };

  const assessButtons = (
    <View style={styles.actionsRow}>
      <Button themed label="Not yet" variant="secondary" onPress={() => assess(false)} style={{ flex: 1 }} />
      <Button themed label="I got it" onPress={() => assess(true)} style={{ flex: 1 }} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.attemptLabel}>
        {isReview ? 'Review — one more try' : `Attempt ${Math.min(attemptsUsed + 1, maxAttempts)} of ${maxAttempts}`}
      </Text>

      <AudioPlayButton
        onPress={original.play}
        hasAudio={original.hasAudio}
        isResolving={original.isResolving}
        hasError={original.hasError}
        onRetry={original.retry}
      />
      <Text style={styles.meaning}>{item.englishMeaning}</Text>
      <Text style={styles.transliteration}>{item.variant.transliteration}</Text>

      {notice === 'missed' ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>Not quite yet — we&apos;ll revisit this one later in the session.</Text>
          <Button themed label="Continue" onPress={onContinue} style={styles.fullWidth} />
        </View>
      ) : permissionStage === 'checking' || permissionStage === 'requesting' ? (
        <Text style={styles.hint}>Checking microphone access…</Text>
      ) : permissionStage === 'needs-explanation' ? (
        <View style={styles.noticeBox}>
          <Text style={styles.hint}>
            Record yourself saying it, then play it back to compare. Your recording stays on this device and is
            deleted right after.
          </Text>
          <Button themed label="Allow microphone access" onPress={requestPermission} style={styles.fullWidth} />
        </View>
      ) : permissionStage === 'denied' ? (
        <>
          <Text style={styles.hint}>
            Microphone is off — say it out loud, then mark how it went. Turn on microphone access in Settings to record
            and compare.
          </Text>
          {assessButtons}
        </>
      ) : (
        <>
          <Text style={styles.hint}>Listen, then record yourself saying it.</Text>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {recordingStage === 'idle' ? (
            <PressableScale
              onPress={startRecording}
              disabled={isBusy}
              accessibilityLabel="Start recording"
              style={[styles.recordButton, isBusy && styles.disabled]}
            >
              <View style={styles.recordDot} />
            </PressableScale>
          ) : null}

          {recordingStage === 'recording' ? (
            <>
              <PressableScale
                onPress={stopRecording}
                disabled={isBusy}
                accessibilityLabel="Stop recording"
                style={[styles.recordButton, styles.recordButtonActive]}
              >
                <View style={styles.stopSquare} />
              </PressableScale>
              <Text style={styles.hint}>{(recorderState.durationMillis / 1000).toFixed(1)}s</Text>
            </>
          ) : null}

          {recordingStage === 'recorded' ? (
            <>
              <Button
                themed
                label={ownPlayerStatus.playing ? 'Playing…' : 'Play my recording'}
                variant="ghost"
                onPress={playOwnRecording}
                style={styles.fullWidth}
              />
              <Text style={styles.hint}>Did it sound like the original?</Text>
              {assessButtons}
              <Button themed label="Record again" variant="ghost" onPress={() => {
                discardFile(recordedUri);
                setRecordedUri(null);
                setRecordingStage('idle');
              }} style={styles.fullWidth} />
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', gap: spacing.sm },
    attemptLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
    meaning: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
    transliteration: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    hint: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: spacing.sm },
    errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    noticeBox: {
      alignSelf: 'stretch',
      gap: spacing.sm,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: `${colors.accent}26`,
    },
    noticeText: { fontSize: 15, color: colors.textPrimary, textAlign: 'center', lineHeight: 21 },
    actionsRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.sm },
    fullWidth: { alignSelf: 'stretch' },
    recordButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 3,
      borderColor: colors.error,
      marginTop: spacing.md,
    },
    recordButtonActive: { backgroundColor: `${colors.error}1F` },
    recordDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.error },
    stopSquare: { width: 24, height: 24, borderRadius: 4, backgroundColor: colors.error },
    disabled: { opacity: 0.5 },
  });
