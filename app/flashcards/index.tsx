import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchFlashcardDecks } from '@/data/flashcards';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import type { FlashcardDeck } from '@/lib/flashcards';
import { useTheme } from '@/lib/theme/ThemeContext';

const DECK_EMOJI: Record<FlashcardDeck['kind'], string> = { due: '🔄', favorites: '⭐', category: '🗂️' };

/**
 * Flashcard decks built from what the learner has already met: Due today,
 * My favorites and one deck per practised category (see buildFlashcardDecks).
 * Refetched on focus so counts are fresh after a session.
 */
export default function FlashcardDecksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const [decks, setDecks] = useState<FlashcardDeck[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    if (!activeProfile) return () => {};
    let cancelled = false;
    setLoadError(false);
    fetchFlashcardDecks(activeProfile.id)
      .then((result) => !cancelled && setDecks(result))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [activeProfile]);

  useFocusEffect(load);

  if (loadError) {
    return (
      <ScreenContainer themed>
        <BackButton themed />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Couldn&apos;t load your decks</Text>
          <Text style={styles.emptyBody}>Flashcards need a connection to load. Check it and try again.</Text>
          <Button themed label="Try again" variant="secondary" onPress={load} />
        </View>
      </ScreenContainer>
    );
  }
  if (!decks) return <LoadingScreen themed />;

  const hasCategories = decks.some((d) => d.kind === 'category');

  return (
    <ScreenContainer themed>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        <BackButton themed />
        <Text style={styles.title}>Flashcards</Text>
        <Text style={styles.subtitle}>Decks from words you&apos;ve already met. Rate each card and we&apos;ll bring it back at the right time.</Text>

        {decks.map((deck) => (
          <PressableScale
            haptic
            key={deck.id}
            accessibilityRole="button"
            onPress={() => router.push(`/flashcards/${deck.id}`)}
            style={styles.deck}
          >
            <Text style={styles.deckEmoji}>{DECK_EMOJI[deck.kind]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.deckTitle}>{deck.title}</Text>
              <Text style={styles.deckMeta}>
                {deck.cardIds.length} {deck.cardIds.length === 1 ? 'card' : 'cards'} · {deck.dueCount} due
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </PressableScale>
        ))}

        {!hasCategories ? (
          <Text style={styles.hint}>
            Category decks appear here as you go: words you practise in lessons and the phrasebook become cards.
          </Text>
        ) : null}

        <Button
          themed
          label="Browse all phrasebook phrases"
          variant="ghost"
          onPress={() => router.push('/phrasebook/flashcards')}
          style={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    list: { paddingBottom: spacing.xl, gap: spacing.sm },
    title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
    subtitle: { fontSize: 15, color: colors.textSecondary, lineHeight: 21, marginBottom: spacing.md },
    deck: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    deckEmoji: { fontSize: 26 },
    deckTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    deckMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    chevron: { fontSize: 22, color: colors.textSecondary },
    hint: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  });
