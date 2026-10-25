import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PRONUNCIATION_MAX_ATTEMPTS, PronunciationPractice } from '@/components/pronunciation/PronunciationPractice';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useTheme } from '@/lib/theme/ThemeContext';
import { getPrimaryVariant } from '@/lib/wordVariants';
import type { Track, WordGroupWithVariants } from '@/types/models';

interface PhraseDetailModalProps {
  phrase: WordGroupWithVariants | null;
  track: Track;
  onClose: () => void;
}

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
 * "Practice saying it" is the shared record → check → compare flow
 * (src/components/pronunciation/PronunciationPractice.tsx) — the same check
 * and result screens as lessons and Repeat After Me, against this phrase's
 * own variants. Finishing resets it for another go (there's no session to
 * revisit in). Recording is hidden for a kid-track profile — mic permission
 * is never requested for kids, per this app's existing hard rule.
 */
export function PhraseDetailModal({ phrase, track, onClose }: PhraseDetailModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { speak, isSpeaking } = useLetterSpeech();
  // Bumped to restart practice after finishing a go (a new phrase remounts it via the key).
  const [practiceKey, setPracticeKey] = useState(0);

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const isVisible = phrase !== null;
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

  const canRecord = track !== 'kid';

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, styles.shadowRaised]}>
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
              <Text style={styles.sourceLabel}>
                {wordPlayer.isFallbackVoice ? '🤖 Generated voice' : '🎙️ Native recording'}
              </Text>
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
                <PronunciationPractice
                  key={`${phrase.id}-${practiceKey}`}
                  nativeVariant={variant}
                  matchGroup={phrase}
                  maxAttempts={PRONUNCIATION_MAX_ATTEMPTS}
                  allowFallbackVoice
                  showNativeButton={false}
                  outOfTriesMessage="Keep practicing — listen to the native speaker again and have another go anytime."
                  onFinish={() => setPracticeKey((k) => k + 1)}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
  const shadowRaised = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 };

  return StyleSheet.create({
    shadowCard,
    shadowRaised,
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
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
      marginBottom: spacing.xs,
      ...shadowCard,
    },
    playButtonActive: { backgroundColor: colors.primaryDark },
    playIcon: { fontSize: 22, color: colors.textOnPrimary },
    sourceLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
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
    recordButtonActive: { backgroundColor: `${colors.error}1F` },
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
      backgroundColor: `${colors.error}1F`,
      alignItems: 'center',
    },
    feedbackBannerCorrect: { backgroundColor: `${colors.success}1F` },
    feedbackText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    feedbackTextCorrect: { color: colors.success },
    attemptText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  });
};
