import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { isUsingMockAiProvider } from '@/lib/ai';
import { transcribeAudio } from '@/lib/ai/functionsClient';
import { getPrimaryVariant, isAnyVariantSpeechMatch } from '@/lib/wordVariants';
import type { Track, WordGroupWithVariants } from '@/types/models';

interface PhraseDetailModalProps {
  phrase: WordGroupWithVariants | null;
  track: Track;
  onClose: () => void;
}

type CheckStage = 'idle' | 'checking' | 'correct' | 'incorrect' | 'exhausted' | 'check-failed';
const MAX_ATTEMPTS = 3;

/**
 * Modeled directly on src/components/culture/ProverbDetailModal.tsx (same
 * bottom-sheet shape/animation) — Arabic script, transliteration, a play
 * button, the usage note, and a record-and-compare control.
 *
 * The play button prefers the variant's real recorded audio (same
 * useWordAudioPlayer/ensureAudioCached path every lesson exercise uses, so
 * it benefits from the same offline caching and picks up admin-recorded
 * native audio immediately) and only falls back to on-device TTS
 * (useLetterSpeech, same approach the Alphabet feature uses) when this
 * particular variant genuinely has no audio_path yet — previously this
 * button used TTS unconditionally, which meant no phrase ever played a real
 * recording even after one existed.
 *
 * Pronunciation checking reuses the exact same pipeline
 * src/components/exercises/adult/SpeakingPractice.tsx already uses for
 * lesson exercises: transcribeAudio (Whisper via the talk-stt function) +
 * isAnyVariantSpeechMatch against this phrase's own word_group/variants —
 * these phrases are real word_groups (see 0007_phrasebook_content.sql), so
 * that matcher works unchanged. Same gate, same caveat: only runs when a
 * live AI provider is configured (EXPO_PUBLIC_TALK_AI_MODE=live); in mock
 * mode (the default) this falls back to self-comparison only (record,
 * listen back, judge yourself against the TTS) — no "Check pronunciation"
 * button, exactly like SpeakingPractice's own mock-mode fallback. Recording
 * is hidden for a kid-track profile — mic permission is never requested for
 * kids, per this app's existing hard rule (moot today since kids are
 * currently flag-hidden, but keeps this correct either way).
 */
export function PhraseDetailModal({ phrase, track, onClose }: PhraseDetailModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const recorder = useVoiceRecorder();
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [checkStage, setCheckStage] = useState<CheckStage>('idle');
  const [attemptCount, setAttemptCount] = useState(0);

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const isVisible = phrase !== null;
  const scoringActive = !isUsingMockAiProvider;
  // Computed here (not after the early returns below) so useWordAudioPlayer
  // can be called unconditionally every render, same requirement as every
  // other hook above it.
  const variant = phrase ? getPrimaryVariant(phrase) : null;
  const wordPlayer = useWordAudioPlayer(variant);

  useEffect(() => {
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

  useEffect(() => {
    if (!isVisible) return;
    contentAnim.setValue(0);
    setRecordedUri(null);
    setRecordError(null);
    setCheckStage('idle');
    setAttemptCount(0);
    Animated.spring(contentAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [phrase?.id, isVisible, contentAnim]);

  if (!phrase || !variant) return null;

  const playPhrase = () => {
    Haptics.selectionAsync();
    if (wordPlayer.hasAudio) {
      wordPlayer.play();
    } else {
      // No audio_path recorded for this variant yet — on-device TTS as a
      // placeholder so the phrase is still audible, same fallback
      // SpeakingPractice-style exercises use elsewhere in the app.
      speak(variant.wordArabic);
    }
  };

  const startRecording = async () => {
    setRecordError(null);
    setCheckStage('idle');
    try {
      await recorder.start();
      Haptics.selectionAsync();
    } catch {
      setRecordError("Couldn't start recording. Give it another try.");
    }
  };

  const stopRecording = async () => {
    try {
      const uri = await recorder.stop();
      if (!uri) {
        setRecordError("That recording didn't save properly. Give it another try.");
        return;
      }
      player.replace({ uri });
      setRecordedUri(uri);
      setCheckStage('idle');
      Haptics.selectionAsync();
    } catch {
      setRecordError("Couldn't finish recording. Give it another try.");
    }
  };

  const playRecording = () => {
    try {
      player.seekTo(0).then(() => player.play());
    } catch {
      setRecordError("Couldn't play that back — try recording again.");
    }
  };

  const checkPronunciation = async () => {
    if (!recordedUri || checkStage === 'checking') return;
    setRecordError(null);
    setCheckStage('checking');
    try {
      const file = new File(recordedUri);
      const bytes = await file.bytes();
      const result = await transcribeAudio(bytes, 'audio/m4a');
      if (!result.ok) {
        setCheckStage('check-failed');
        return;
      }

      const nextAttemptCount = attemptCount + 1;
      setAttemptCount(nextAttemptCount);

      if (isAnyVariantSpeechMatch(phrase, result.text)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCheckStage('correct');
      } else if (nextAttemptCount >= MAX_ATTEMPTS) {
        setCheckStage('exhausted');
      } else {
        setCheckStage('incorrect');
      }
    } catch {
      setCheckStage('check-failed');
    }
  };

  const canRecord = track !== 'kid';

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, shadows.raised]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Animated.View
              style={{
                opacity: contentAnim,
                transform: [{ scale: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
              }}
            >
              <Text style={styles.english}>{phrase.englishMeaning}</Text>
              <Text style={styles.arabic}>{variant.wordArabic}</Text>
              <Text style={styles.transliteration}>{variant.transliteration}</Text>

              <PressableScale
                onPress={playPhrase}
                style={[styles.playButton, (wordPlayer.isPlaying || isSpeaking) && styles.playButtonActive]}
              >
                <Text style={styles.playIcon}>
                  {wordPlayer.isResolving ? '…' : wordPlayer.isPlaying || isSpeaking ? '🔊' : '▶'}
                </Text>
              </PressableScale>
            </Animated.View>

            {variant.notes ? (
              <>
                <Text style={styles.sectionLabel}>When to say this</Text>
                <View style={styles.card}>
                  <Text style={styles.cardText}>{variant.notes}</Text>
                </View>
              </>
            ) : null}

            {canRecord ? (
              <>
                <Text style={styles.sectionLabel}>Practice saying it</Text>
                {recordError ? <Text style={styles.errorText}>{recordError}</Text> : null}

                {recorder.permission === 'needs-explanation' ? (
                  <PressableScale onPress={recorder.requestPermission} style={styles.micPrompt}>
                    <Text style={styles.micPromptText}>
                      {scoringActive
                        ? '🎙️ Allow the microphone to record yourself — we’ll check how close it sounds to the correct pronunciation.'
                        : '🎙️ Allow the microphone to record yourself and compare — just for you, never scored or sent anywhere.'}
                    </Text>
                  </PressableScale>
                ) : recorder.permission === 'denied' ? (
                  <Text style={styles.mutedText}>Microphone access is off — turn it on in Settings to practice speaking.</Text>
                ) : (
                  <View style={styles.recordRow}>
                    <PressableScale
                      onPress={recorder.isRecording ? stopRecording : startRecording}
                      style={[styles.recordButton, recorder.isRecording && styles.recordButtonActive]}
                    >
                      <Text style={styles.recordIcon}>{recorder.isRecording ? '⏹' : '🎙️'}</Text>
                    </PressableScale>
                    <Text style={styles.recordLabel}>
                      {recorder.isRecording ? 'Recording… tap to stop' : 'Tap to record yourself'}
                    </Text>
                  </View>
                )}

                {recordedUri ? (
                  <PressableScale onPress={playRecording} style={styles.playbackButton}>
                    <Text style={styles.playbackIcon}>{playerStatus.playing ? '⏸' : '▶️'}</Text>
                    <Text style={styles.playbackLabel}>Your recording</Text>
                  </PressableScale>
                ) : null}

                {recordedUri && scoringActive ? (
                  checkStage === 'idle' || checkStage === 'checking' ? (
                    <Button
                      label="Check pronunciation"
                      onPress={checkPronunciation}
                      loading={checkStage === 'checking'}
                      variant="secondary"
                      style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}
                    />
                  ) : (
                    <View
                      style={[
                        styles.feedbackBanner,
                        checkStage === 'correct' && styles.feedbackBannerCorrect,
                        { marginBottom: spacing.xl },
                      ]}
                    >
                      <Text style={[styles.feedbackText, checkStage === 'correct' && styles.feedbackTextCorrect]}>
                        {checkStage === 'correct'
                          ? 'Nice! That sounds right.'
                          : checkStage === 'incorrect'
                            ? 'Not quite — give it another try.'
                            : checkStage === 'exhausted'
                              ? "No worries — here's how it's said above."
                              : "Couldn't check that this time — you can keep practicing."}
                      </Text>
                      {checkStage === 'incorrect' ? (
                        <Text style={styles.attemptText}>
                          Attempt {attemptCount} of {MAX_ATTEMPTS}
                        </Text>
                      ) : null}
                    </View>
                  )
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36, 32, 33, 0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 18, color: colors.textPrimary },
  english: { fontSize: 15, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  arabic: {
    fontSize: 28,
    lineHeight: 42,
    textAlign: 'center',
    color: colors.textPrimary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  transliteration: { fontSize: 15, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xs },
  playButton: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  playButtonActive: { backgroundColor: colors.primaryDark },
  playIcon: { fontSize: 22, color: colors.textOnPrimary },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  card: { backgroundColor: colors.background, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg },
  cardText: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  errorText: { fontSize: 13, color: colors.error, marginBottom: spacing.sm },
  micPrompt: { backgroundColor: colors.background, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg },
  micPromptText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  mutedText: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonActive: { backgroundColor: '#FBEAE6' },
  recordIcon: { fontSize: 22 },
  recordLabel: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  playbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginBottom: spacing.xl,
  },
  playbackIcon: { fontSize: 18 },
  playbackLabel: { fontSize: 15, fontWeight: '600', color: colors.primary },
  feedbackBanner: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#FBEAE6',
    alignItems: 'center',
  },
  feedbackBannerCorrect: { backgroundColor: '#E3F5EA' },
  feedbackText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  feedbackTextCorrect: { color: '#2E9F68' },
  attemptText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
});
