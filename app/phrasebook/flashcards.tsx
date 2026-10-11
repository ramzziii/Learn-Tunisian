import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { fetchPhrasebookCategories, fetchWordGroupsForLesson } from '@/data/content';
import { useFadeInOnChange } from '@/hooks/useFadeInOnChange';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { getPrimaryVariant } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

/**
 * Browse-and-listen flashcards across the whole phrasebook, one deck —
 * mirrors app/alphabet-flashcards.tsx's existing pattern (always-visible
 * card, tap to hear it, Prev/Next) rather than inventing a flip/reveal
 * mechanic or a separate per-category picker screen.
 */
export default function PhrasebookFlashcardsScreen() {
  const [cards, setCards] = useState<WordGroupWithVariants[] | null>(null);
  const [index, setIndex] = useState(0);
  const { speak, isSpeaking } = useLetterSpeech();
  const fadeAnim = useFadeInOnChange(String(index));
  // Computed here (not after the early returns below) so useWordAudioPlayer
  // can be called unconditionally every render, same requirement as every
  // other hook above it.
  const card = cards?.[index] ?? null;
  const variant = card ? getPrimaryVariant(card) : null;
  const wordPlayer = useWordAudioPlayer(variant);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const categories = await fetchPhrasebookCategories().catch(() => []);
      const perCategory = await Promise.all(
        categories.map((c) => fetchWordGroupsForLesson(c.lessonId).catch(() => []))
      );
      if (!cancelled) setCards(perCategory.flat());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (cards === null) return <LoadingScreen />;

  if (cards.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📇</Text>
          <Text style={styles.emptyTitle}>No phrases yet</Text>
          <Text style={styles.emptyBody}>Check back once the phrasebook has content.</Text>
        </View>
      </ScreenContainer>
    );
  }

  // Unreachable in practice (cards.length > 0 here guarantees cards[index]
  // exists) — just satisfies narrowing for the render below, which uses
  // `card` rather than re-indexing `cards[index]` directly.
  if (!card) return null;

  const goNext = () => {
    Haptics.selectionAsync();
    setIndex((prev) => (prev + 1) % cards.length);
  };
  const goPrevious = () => {
    Haptics.selectionAsync();
    setIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };
  const playCard = () => {
    if (!variant) return;
    Haptics.selectionAsync();
    if (wordPlayer.hasAudio) {
      wordPlayer.play();
    } else {
      // No audio_path recorded for this variant yet — on-device TTS as a
      // placeholder so the card is still audible.
      speak(variant.wordArabic);
    }
  };

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <ProgressBar progress={(index + 1) / cards.length} />
        </View>
      </View>

      <Text style={styles.counter}>
        {index + 1} of {cards.length}
      </Text>

      <Animated.View style={{ opacity: fadeAnim }}>
        <PressableScale onPress={playCard} style={[styles.card, shadows.raised]}>
          <Text style={styles.english}>{card.englishMeaning}</Text>
          {variant ? (
            <>
              <Text style={styles.arabic}>{variant.wordArabic}</Text>
              <Text style={styles.transliteration}>{variant.transliteration}</Text>
            </>
          ) : null}
          <View style={[styles.playBadge, (wordPlayer.isPlaying || isSpeaking) && styles.playBadgeActive]}>
            <Text style={styles.playIcon}>
              {wordPlayer.isResolving ? 'Loading…' : wordPlayer.isPlaying || isSpeaking ? '🔊 Playing…' : '▶ Tap to hear it'}
            </Text>
          </View>
        </PressableScale>
      </Animated.View>

      <View style={styles.navRow}>
        <View style={styles.navButtonWrapper}>
          <PressableScale onPress={goPrevious} style={[styles.navButton, styles.navButtonSecondary]}>
            <Text style={styles.navButtonSecondaryText}>‹ Previous</Text>
          </PressableScale>
        </View>
        <View style={styles.navButtonWrapper}>
          <PressableScale onPress={goNext} style={[styles.navButton, styles.navButtonPrimary]}>
            <Text style={styles.navButtonPrimaryText}>Next ›</Text>
          </PressableScale>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F5F2', paddingHorizontal: spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 26, color: colors.textPrimary },
  progressTrack: { flex: 1, marginLeft: spacing.md },
  counter: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  english: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  arabic: { fontSize: 32, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.lg },
  transliteration: { fontSize: 16, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.xs },
  playBadge: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  },
  playBadgeActive: { backgroundColor: '#FDF3E4' },
  playIcon: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },
  navRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  navButtonWrapper: { flex: 1 },
  navButton: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  navButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  navButtonSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  navButtonPrimary: { backgroundColor: colors.primary, ...shadows.card },
  navButtonPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
});
