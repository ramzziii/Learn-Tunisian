import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { PremiumBadge } from '@/components/premium/Premium';
import { ComputerVoiceNote } from '@/components/ui/ComputerVoiceNote';
import { PressableScale } from '@/components/ui/PressableScale';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchPhrasebookCategories, fetchWordGroupsForLesson } from '@/data/content';
import { useAccess } from '@/lib/access/AccessContext';
import { useFadeInOnChange } from '@/hooks/useFadeInOnChange';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { useTheme } from '@/lib/theme/ThemeContext';
import { hasTwoForms, preferredVariant } from '@/lib/display/displayRules';
import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
import { FormDisplay } from '@/components/tunisian/FormDisplay';
import { TunisianText } from '@/components/tunisian/TunisianText';
import type { WordGroupWithVariants } from '@/types/models';

/**
 * Browse-and-listen flashcards across the whole phrasebook, one deck —
 * mirrors app/alphabet-flashcards.tsx's existing pattern (always-visible
 * card, tap to hear it, Prev/Next) rather than inventing a flip/reveal
 * mechanic or a separate per-category picker screen.
 */
export default function PhrasebookFlashcardsScreen() {
  const { colors } = useTheme();
  const { preferences: display } = useDisplayPreferences();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { tier, decide } = useAccess();
  const [cards, setCards] = useState<WordGroupWithVariants[] | null>(null);
  // Practice isn't counted: the deck uses only categories already opened (all
  // with Premium). The rest are counted from the category list so the deck can
  // say what's left, but never fetched.
  const [lockedPhraseCount, setLockedPhraseCount] = useState(0);
  const [index, setIndex] = useState(0);
  const fadeAnim = useFadeInOnChange(String(index));
  // Computed here (not after the early returns below) so useWordAudioPlayer
  // can be called unconditionally every render, same requirement as every
  // other hook above it.
  const card = cards?.[index] ?? null;
  const variant = card ? preferredVariant(card, display.form) : null;
  const wordPlayer = useWordAudioPlayer(variant);

  const load = useCallback(async () => {
    const categories = await fetchPhrasebookCategories().catch(() => []);
    const accessible = categories.filter((c) => decide('phrasebook_category', c.unitId) === 'open');
    const locked = categories.filter((c) => !accessible.includes(c));
    const perCategory = await Promise.all(accessible.map((c) => fetchWordGroupsForLesson(c.lessonId).catch(() => [])));
    return { cards: perCategory.flat(), lockedPhraseCount: locked.reduce((sum, c) => sum + c.phraseCount, 0) };
  }, [decide]);

  // Refetches on every focus (not just mount) so audio re-recorded in the
  // admin tool is picked up on returning to this screen, not just on a cold
  // app start — same reasoning/pattern as the category list and detail
  // screens (both already use useFocusEffect for this).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().then((result) => {
        if (cancelled) return;
        setCards(result.cards);
        setLockedPhraseCount(result.lockedPhraseCount);
      });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  if (cards === null) return <LoadingScreen themed />;

  if (cards.length === 0) {
    return (
      <ScreenContainer themed>
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
  // Plays the card's recording when tapped; a computer voice is labelled,
  // and the phone's own voice is never used for a card without one.
  const playCard = () => {
    if (!variant || !wordPlayer.hasAudio) return;
    Haptics.selectionAsync();
    wordPlayer.play();
  };

  return (
    <ScreenContainer themed style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <ProgressBar themed progress={(index + 1) / cards.length} />
        </View>
      </View>

      <Text style={styles.counter}>
        {index + 1} of {cards.length}
      </Text>

      <Animated.View style={{ opacity: fadeAnim }}>
        <PressableScale onPress={playCard} style={[styles.card, styles.shadowRaised]}>
          <Text style={styles.english}>{card.englishMeaning}</Text>
          {variant ? (
            <>
              {card && hasTwoForms(card) ? (
                <FormDisplay group={card} size="lg" arabicStyle={styles.arabic} latinStyle={styles.transliteration} />
              ) : (
                <TunisianText arabic={variant.wordArabic} latin={variant.transliteration} size="xl" arabicStyle={styles.arabic} latinStyle={styles.transliteration} style={{ alignItems: 'center' }} />
              )}
            </>
          ) : null}
          <View style={[styles.playBadge, wordPlayer.isPlaying && styles.playBadgeActive]}>
            <Text style={styles.playIcon}>
              {wordPlayer.isResolving
                ? 'Loading…'
                : wordPlayer.isPlaying
                  ? '🔊 Playing…'
                  : wordPlayer.hasAudio
                    ? '▶ Tap to hear it'
                    : 'No recording yet'}
            </Text>
          </View>
          {wordPlayer.source === 'computer' ? <ComputerVoiceNote style={{ marginTop: spacing.sm }} /> : null}
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

      {lockedPhraseCount > 0 ? (
        <PressableScale haptic onPress={() => router.push('/phrasebook')} style={[styles.lockedRow, styles.shadowCard]}>
          <PremiumBadge signUp={tier === 'guest'} />
          <Text style={styles.lockedText}>
            {lockedPhraseCount} more {lockedPhraseCount === 1 ? 'phrase' : 'phrases'} in categories you haven’t opened
          </Text>
          <Text style={styles.lockedChevron}>›</Text>
        </PressableScale>
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
  const shadowRaised = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 };

  return StyleSheet.create({
    shadowCard,
    shadowRaised,
    lockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
    },
    lockedText: { flex: 1, fontSize: 14, color: colors.textSecondary },
    lockedChevron: { fontSize: 20, color: colors.textSecondary },
    screen: { backgroundColor: colors.background, paddingHorizontal: spacing.lg },
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
    playBadgeActive: { backgroundColor: `${colors.accent}26` },
    playIcon: { fontSize: 14, fontWeight: '600', color: colors.primary },
    navRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
    navButtonWrapper: { flex: 1 },
    navButton: { paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
    navButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
    navButtonSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    navButtonPrimary: { backgroundColor: colors.primary, ...shadowCard },
    navButtonPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.sm },
    emptyTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  });
};
