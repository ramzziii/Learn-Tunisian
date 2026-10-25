import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { openUpgradeFlow, PremiumBadge } from '@/components/premium/Premium';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { buildAlphabetSet, splitAtLetter } from '@/lib/alphabet';
import { usePremium } from '@/lib/premium/PremiumContext';
import { canAccessLetter, FREE_ALPHABET_LETTER_IDS } from '@/lib/premium/access';
import { useFadeInOnChange } from '@/hooks/useFadeInOnChange';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

const letters = buildAlphabetSet();

export default function AlphabetFlashcardsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const { speak, isSpeaking } = useLetterSpeech();
  const fadeAnim = useFadeInOnChange(String(index));

  const { isPremium } = usePremium();
  const letter = letters[index];
  const isLocked = !canAccessLetter(isPremium, letter.id);
  const example = letter.examples[0];
  const highlighted = splitAtLetter(example.arabic, letter);

  const goNext = () => {
    Haptics.selectionAsync();
    setIndex((prev) => (prev + 1) % letters.length);
  };
  const goPrevious = () => {
    Haptics.selectionAsync();
    setIndex((prev) => (prev - 1 + letters.length) % letters.length);
  };
  const playLetter = () => {
    if (isLocked) return;
    Haptics.selectionAsync();
    speak(letter.label);
  };
  const playExample = () => {
    if (isLocked) return;
    Haptics.selectionAsync();
    speak(example.arabic);
  };

  return (
    <ScreenContainer themed style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <ProgressBar themed progress={(index + 1) / letters.length} />
        </View>
      </View>

      <Text style={styles.counter}>
        {index + 1} of {letters.length}
      </Text>

      {isLocked ? (
        // Past the free letters: the card stays visible and in order (so the
        // deck's size is honest), but shows no audio/examples — just what's
        // locked and how to unlock it.
        <PressableScale haptic onPress={openUpgradeFlow} style={[styles.card, shadows.raised]}>
          <PremiumBadge />
          <Text style={[styles.bigLetter, styles.lockedText]}>{letter.label}</Text>
          <Text style={[styles.name, styles.lockedText]}>{letter.name}</Text>
          <Text style={styles.lockedHint}>
            The free plan includes the first {FREE_ALPHABET_LETTER_IDS.length} letters. Tap to unlock all{' '}
            {letters.length} with Premium.
          </Text>
        </PressableScale>
      ) : (
        <Animated.View style={{ opacity: fadeAnim }}>
          <PressableScale onPress={playLetter} style={[styles.card, shadows.raised]}>
            <Text style={styles.bigLetter}>{letter.label}</Text>
            <Text style={styles.name}>{letter.name}</Text>
            <View style={[styles.playBadge, isSpeaking && styles.playBadgeActive]}>
              <Text style={styles.playIcon}>{isSpeaking ? '🔊 Playing…' : '▶ Tap to hear it'}</Text>
            </View>
          </PressableScale>

          <PressableScale onPress={playExample} style={[styles.exampleRow, shadows.card]}>
            <Text style={styles.exampleEmoji}>{example.emoji ?? '🔤'}</Text>
            <View style={styles.exampleTextColumn}>
              <Text style={styles.exampleArabic}>
                {highlighted ? (
                  <>
                    {highlighted.before}
                    <Text style={styles.exampleArabicHighlight}>{highlighted.match}</Text>
                    {highlighted.after}
                  </>
                ) : (
                  example.arabic
                )}
              </Text>
              <Text style={styles.exampleMeta}>
                {example.transliteration} · {example.english}
              </Text>
            </View>
            <Text style={styles.exampleAudioHint}>🔈</Text>
          </PressableScale>

          {letter.arabiziNote ? (
            <View style={styles.arabiziCard}>
              <View style={styles.arabiziHeaderRow}>
                <Text style={styles.arabiziTitle}>Tunisian Arabizi</Text>
                <View style={styles.arabiziBadge}>
                  <Text style={styles.arabiziBadgeText}>{letter.arabiziNote.label}</Text>
                </View>
              </View>
              <Text style={styles.arabiziExplanation}>{letter.arabiziNote.explanation}</Text>
            </View>
          ) : null}
        </Animated.View>
      )}

      <View style={styles.navRow}>
        {/* Plain Views own the flex:1 here, not PressableScale — PressableScale
            applies the style it's given to an inner Animated.View rather than
            the Pressable it renders, so a flex:1 passed to it never reaches
            the actual flex child of the row, and the buttons don't expand
            (this was why the labels were unreadable — squeezed to near-zero
            width). */}
        <View style={styles.navButtonWrapper}>
          <PressableScale onPress={goPrevious} style={[styles.navButton, styles.navButtonSecondary]}>
            <Text style={styles.navButtonSecondaryText}>‹ Previous</Text>
          </PressableScale>
        </View>
        <View style={styles.navButtonWrapper}>
          <PressableScale onPress={goNext} style={[styles.navButton, styles.navButtonPrimary]}>
            <Text style={styles.navButtonPrimaryText}>Next letter ›</Text>
          </PressableScale>
        </View>
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    lockedText: { opacity: 0.45 },
    lockedHint: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, lineHeight: 20 },
    screen: { backgroundColor: colors.background, paddingHorizontal: spacing.lg },
    topbar: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
    closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    closeIcon: { fontSize: 26, color: colors.textPrimary },
    progressTrack: { flex: 1, marginLeft: spacing.md },
    counter: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    card: {
      marginTop: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    bigLetter: { fontSize: 104, color: colors.textPrimary },
    name: { fontSize: 20, color: colors.textSecondary, marginTop: spacing.sm },
    playBadge: {
      marginTop: spacing.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.pill,
      backgroundColor: colors.background,
    },
    playBadgeActive: { backgroundColor: `${colors.accent}26` },
    playIcon: { fontSize: 14, fontWeight: '600', color: colors.primary },
    exampleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    exampleEmoji: { fontSize: 28 },
    exampleTextColumn: { flex: 1, alignItems: 'center' },
    exampleArabic: { fontSize: 26, color: colors.textPrimary },
    // No bold weight here — a heavier weight renders visibly larger for this
    // Arabic glyph shape even at an identical fontSize, which read as "bigger"
    // rather than just "different color".
    exampleArabicHighlight: { fontSize: 26, color: colors.error, fontWeight: '400' },
    exampleMeta: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
    exampleAudioHint: { fontSize: 14, opacity: 0.5 },
    arabiziCard: {
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    arabiziHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    arabiziTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
    arabiziBadge: {
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    arabiziBadgeText: { fontSize: 13, fontWeight: '700', color: colors.textOnPrimary },
    arabiziExplanation: { fontSize: 13, color: colors.textPrimary, lineHeight: 19, marginTop: spacing.xs },
    navRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
    navButtonWrapper: { flex: 1 },
    navButton: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
    navButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
    navButtonSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    navButtonPrimary: { backgroundColor: colors.primary, ...shadows.card },
    navButtonPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
  });
