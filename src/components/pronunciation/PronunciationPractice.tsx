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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { Button } from '@/components/ui/Button';
import { FeedbackSheet } from '@/components/ui/FeedbackSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { isUsingMockAiProvider } from '@/lib/ai';
import { transcribeAudio } from '@/lib/ai/functionsClient';
import { useTheme } from '@/lib/theme/ThemeContext';
import { isAnyVariantSpeechMatch } from '@/lib/wordVariants';
import type { WordGroupWithVariants, WordVariant } from '@/types/models';

/** Tries per word, everywhere a learner records. */
export const PRONUNCIATION_MAX_ATTEMPTS = 3;
/** Countdown on the "Great job" and out-of-tries pop-ups before moving on by itself. */
export const REVISIT_AUTO_ADVANCE_MS = 3000;

const isWeb = Platform.OS === 'web';

type PermissionStage = 'checking' | 'needs-explanation' | 'requesting' | 'denied' | 'ready';
type Stage = 'idle' | 'recording' | 'checking' | 'self-assess' | 'verdict';

export interface PronunciationResult {
  /** Said right (by the check, or the learner's own call when it can't run). */
  correct: boolean;
  attempts: number;
}

interface PronunciationPracticeProps {
  /** The native recording to imitate (and compare with). */
  nativeVariant: WordVariant;
  /** Accepted spellings for the automatic check (any variant matches). */
  matchGroup: Pick<WordGroupWithVariants, 'variants'> & { id?: string };
  maxAttempts: number;
  /** Device voice when the native recording is missing. False for Repeat After Me. */
  allowFallbackVoice?: boolean;
  /** Hide the big native play button (the host already shows one). */
  showNativeButton?: boolean;
  /** Replaces "we'll revisit this one later" (e.g. in an end-of-session revisit). */
  outOfTriesMessage?: string;
  onFinish: (result: PronunciationResult) => void;
  /** Host content shown under the native play button (meaning, hints…). */
  children?: ReactNode;
}

/**
 * The one record → check → compare flow used everywhere a learner records.
 *
 * The automatic check is the app's existing one — the recording is
 * transcribed by the talk-stt function and matched against the word's
 * variants (isAnyVariantSpeechMatch). It only runs in live AI mode; when it
 * can't run (mock mode, offline, a service error, microphone off) the
 * learner decides, using the same result screens. Either way they can play
 * their recording and the native one side by side.
 *
 * Up to `maxAttempts` tries: "Try again" or "Move on" after a miss; after the
 * last miss it says the word will be revisited and moves on by itself (unless
 * they're busy comparing recordings). The learner's audio is deleted as soon
 * as it's been judged, retried, or left — nothing of theirs is kept.
 */
export function PronunciationPractice({
  nativeVariant,
  matchGroup,
  maxAttempts,
  allowFallbackVoice = true,
  showNativeButton = true,
  outOfTriesMessage,
  onFinish,
  children,
}: PronunciationPracticeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const native = useWordAudioPlayer(nativeVariant, { autoPlay: true, fallbackVoice: allowFallbackVoice });

  const [permission, setPermission] = useState<PermissionStage>('checking');
  const [stage, setStage] = useState<Stage>('idle');
  const [verdict, setVerdict] = useState<'correct' | 'incorrect' | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  const stageRef = useRef<Stage>('idle');
  stageRef.current = stage;
  const recordedUriRef = useRef<string | null>(null);
  recordedUriRef.current = recordedUri;
  const hasFinishedRef = useRef(false);

  const discardFile = useCallback((uri: string | null) => {
    if (!uri || isWeb) return; // web recordings are in-memory blobs
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Best-effort: the OS may already have cleared its cache.
    }
  }, []);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status: RecordingStatus) => {
    // An interruption (a call, another app taking audio, media services
    // reset) mid-recording: discard the partial take, don't count it.
    if (status.hasError && stageRef.current === 'recording') {
      recorder.stop().catch(() => {});
      discardFile(recorder.uri);
      setStage('idle');
      setErrorMessage('Recording was interrupted — please try again.');
    }
  });
  const recorderState = useAudioRecorderState(recorder, 100);
  const ownPlayer = useAudioPlayer(null);
  const ownPlayerStatus = useAudioPlayerStatus(ownPlayer);

  useEffect(() => {
    getRecordingPermissionsAsync()
      .then(({ status }) => setPermission(status === 'granted' ? 'ready' : status === 'denied' ? 'denied' : 'needs-explanation'))
      .catch(() => setPermission('needs-explanation'));
  }, []);

  useEffect(
    () => () => {
      if (stageRef.current === 'recording') recorder.stop().catch(() => {});
      discardFile(recordedUriRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isOutOfTries = stage === 'verdict' && verdict === 'incorrect' && attempts >= maxAttempts;

  const finish = (correct: boolean) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    discardFile(recordedUri);
    setRecordedUri(null);
    onFinish({ correct, attempts: Math.max(attempts, 1) });
  };

  const judge = (correct: boolean) => {
    setAttempts((a) => a + 1);
    setVerdict(correct ? 'correct' : 'incorrect');
    setStage('verdict');
    if (correct) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const requestPermission = async () => {
    setPermission('requesting');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const { status } = await requestRecordingPermissionsAsync();
      setPermission(status === 'granted' ? 'ready' : 'denied');
    } catch {
      setPermission('denied');
    }
  };

  const beginRecording = async () => {
    setErrorMessage(null);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.selectionAsync().catch(() => {});
      setStage('recording');
    } catch {
      setErrorMessage("Couldn't start recording. Give it another try.");
      setStage('idle');
    }
  };

  const startRecording = () => {
    if (stage !== 'idle') return;
    beginRecording();
  };

  const check = async (uri: string) => {
    if (isUsingMockAiProvider) {
      setCheckFailed(false);
      setStage('self-assess');
      return;
    }
    setStage('checking');
    try {
      const bytes = isWeb ? new Uint8Array(await (await fetch(uri)).arrayBuffer()) : await new File(uri).bytes();
      const result = await transcribeAudio(bytes, isWeb ? 'audio/webm' : 'audio/m4a');
      if (!result.ok) throw new Error(result.error.message);
      judge(isAnyVariantSpeechMatch(matchGroup as WordGroupWithVariants, result.text));
    } catch {
      setCheckFailed(true);
      setStage('self-assess');
    }
  };

  const stopRecording = async () => {
    if (stage !== 'recording') return;
    try {
      await recorder.stop();
      if (!recorder.uri) {
        setErrorMessage("That recording didn't save — give it another try.");
        setStage('idle');
        return;
      }
      setRecordedUri(recorder.uri);
      await check(recorder.uri);
    } catch {
      setErrorMessage("That recording didn't save — give it another try.");
      setStage('idle');
    }
  };

  const playMine = () => {
    if (!recordedUri) return;
    setIsComparing(true);
    try {
      ownPlayer.replace({ uri: recordedUri });
      ownPlayer
        .seekTo(0)
        .then(() => ownPlayer.play())
        .catch(() => setErrorMessage("Couldn't play your recording back."));
    } catch {
      setErrorMessage("Couldn't play your recording back.");
    }
  };

  const playNative = () => {
    setIsComparing(true);
    native.play();
  };

  /** Straight back into recording — no extra tap on the record button. With
   * the microphone off it returns to the say-it-aloud choice instead. */
  const tryAgain = () => {
    discardFile(recordedUri);
    setRecordedUri(null);
    setVerdict(null);
    setCheckFailed(false);
    setIsComparing(false);
    setStage('idle');
    if (permission === 'ready') beginRecording();
  };

  // Each button sits in a flex:1 wrapper — PressableScale applies its style to
  // an inner Animated.View, so a flex share passed to the button itself never
  // reaches the row and long labels overflow the screen.
  const pair = (left: ReactNode, right: ReactNode) => (
    <View style={styles.row}>
      {left ? <View style={styles.cell}>{left}</View> : null}
      <View style={styles.cell}>{right}</View>
    </View>
  );

  const compareButtons = pair(
    recordedUri ? (
      <Button
        themed
        label={ownPlayerStatus.playing ? '⏸ Playing…' : '▶ Your voice'}
        variant="secondary"
        onPress={playMine}
        style={styles.compactButton}
      />
    ) : null,
    <Button
      themed
      label={native.isPlaying ? '⏸ Playing…' : '▶ Native'}
      variant="secondary"
      onPress={playNative}
      style={styles.compactButton}
    />
  );

  const assessButtons = pair(
    <Button themed label="Not yet" variant="secondary" onPress={() => judge(false)} style={styles.compactButton} />,
    <Button themed label="I got it" onPress={() => judge(true)} style={styles.compactButton} />
  );

  const attemptLabel = `Attempt ${Math.min(attempts + 1, maxAttempts)} of ${maxAttempts}`;

  const body = (() => {
    // The result itself is a pop-up (see `resultSheet` below); the page just
    // keeps the word visible behind it.
    if (stage === 'verdict') return null;
    if (stage === 'self-assess') {
      return (
        <View style={styles.resultBox}>
          <Text style={styles.resultBody}>
            {checkFailed
              ? 'Couldn’t check automatically this time — how did it sound?'
              : 'Did it sound like the native speaker?'}
          </Text>
          {compareButtons}
          {assessButtons}
        </View>
      );
    }
    if (stage === 'checking') return <Text style={styles.hint}>Checking your pronunciation…</Text>;

    if (permission === 'checking' || permission === 'requesting') {
      return <Text style={styles.hint}>Checking microphone access…</Text>;
    }
    if (permission === 'needs-explanation') {
      return (
        <View style={styles.resultBox}>
          <Text style={styles.hint}>
            Record yourself saying it, then compare with the native speaker. Your recording is deleted right after.
          </Text>
          <Button themed label="Allow microphone access" onPress={requestPermission} style={styles.fullWidth} />
        </View>
      );
    }
    if (permission === 'denied') {
      return (
        <View style={styles.resultBox}>
          <Text style={styles.hint}>
            Microphone is off — say it out loud, then mark how it went. Turn on microphone access in Settings to
            record and compare.
          </Text>
          {assessButtons}
        </View>
      );
    }

    return (
      <>
        <Text style={styles.attemptLabel}>{attemptLabel}</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {stage === 'recording' ? (
          <>
            <PressableScale
              onPress={stopRecording}
              accessibilityLabel="Stop recording"
              style={[styles.recordButton, styles.recordButtonActive]}
            >
              <View style={styles.stopSquare} />
            </PressableScale>
            <Text style={styles.hint}>{(recorderState.durationMillis / 1000).toFixed(1)}s — tap to stop</Text>
          </>
        ) : (
          <PressableScale onPress={startRecording} accessibilityLabel="Start recording" style={styles.recordButton}>
            <View style={styles.recordDot} />
          </PressableScale>
        )}
      </>
    );
  })();

  const resultSheet =
    stage !== 'verdict' ? null : verdict === 'correct' ? (
      <FeedbackSheet
        visible
        tone="success"
        icon="🎉"
        title="Great job!"
        message="That sounded right."
        autoAdvanceSeconds={REVISIT_AUTO_ADVANCE_MS / 1000}
        onPrimary={() => finish(true)}
      />
    ) : isOutOfTries ? (
      <FeedbackSheet
        visible
        tone="error"
        icon="🔁"
        title="Not quite right yet"
        message={outOfTriesMessage ?? 'We’ll revisit this one later in the session.'}
        autoAdvanceSeconds={REVISIT_AUTO_ADVANCE_MS / 1000}
        paused={isComparing}
        onPrimary={() => finish(false)}
      >
        {compareButtons}
      </FeedbackSheet>
    ) : (
      <FeedbackSheet
        visible
        tone="error"
        icon="🤔"
        title="Not quite right yet"
        message="Listen to both to hear where it differs."
        primaryLabel="Try again"
        onPrimary={tryAgain}
        secondaryLabel="Move on"
        onSecondary={() => finish(false)}
      >
        {compareButtons}
        <Text style={styles.tryCount}>
          Try {attempts} of {maxAttempts}
        </Text>
      </FeedbackSheet>
    );

  return (
    <View style={styles.container}>
      {showNativeButton ? (
        <AudioPlayButton
          onPress={native.play}
          hasAudio={native.hasAudio}
          isResolving={native.isResolving}
          hasError={native.hasError}
          onRetry={native.retry}
        />
      ) : null}
      {children}
      {body}
      {resultSheet}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
    attemptLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
    },
    hint: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: spacing.sm },
    errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
    resultBox: {
      alignSelf: 'stretch',
      gap: spacing.sm,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: `${colors.accent}26`,
    },
    resultBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    row: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
    cell: { flex: 1, minWidth: 0 },
    compactButton: { paddingHorizontal: spacing.sm },
    tryCount: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
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
      marginTop: spacing.sm,
    },
    recordButtonActive: { backgroundColor: `${colors.error}1F` },
    recordDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.error },
    stopSquare: { width: 24, height: 24, borderRadius: 4, backgroundColor: colors.error },
  });
