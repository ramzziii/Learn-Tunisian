import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FlashcardSession } from '@/components/flashcards/FlashcardSession';
import { PremiumGate } from '@/components/premium/Premium';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { spacing, type ThemeColors } from '@/constants/theme';
import { fetchFlashcardDecks, fetchFlashcards } from '@/data/flashcards';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import type { FlashcardDeck } from '@/lib/flashcards';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import { canStartReview, FREE_REVIEW_WORD_LIMIT, limitReviewQueue } from '@/lib/premium/access';
import { hasUsedFreeReviewToday, markFreeReviewStarted } from '@/lib/premium/freeAllowance';
import { usePremium } from '@/lib/premium/PremiumContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES = 5;

const EMPTY: Record<FlashcardDeck['kind'], { emoji: string; title: string; body: string }> = {
  due: { emoji: '🌿', title: 'All caught up', body: 'Nothing is due right now. Cards come back here when it’s time to see them again.' },
  favorites: { emoji: '⭐', title: 'No favorites yet', body: 'Tap the star on any word or phrase to save it, and it will show up here.' },
  category: { emoji: '🗂️', title: 'No cards here yet', body: 'Practise words from this category in a lesson or the phrasebook and they’ll appear here.' },
};

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'allowance-used' }
  | { kind: 'empty'; deck: FlashcardDeck }
  | { kind: 'ready'; cards: WordGroupWithVariants[]; pool: WordGroupWithVariants[]; goalMinutes: number };

/**
 * One deck's study session. Due today shares the free plan's daily review
 * allowance with the Review screen (one session a day, up to
 * FREE_REVIEW_WORD_LIMIT cards) so it isn't a way around it; category and
 * favorites decks hold words the learner already had access to and aren't
 * limited.
 */
export default function FlashcardDeckScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const { isPremium, isResolved } = usePremium();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!activeProfile || !isResolved) return;
    let cancelled = false;
    (async () => {
      const decks = await fetchFlashcardDecks(activeProfile.id);
      const deck = decks.find((d) => d.id === deckId);
      if (cancelled) return;
      if (!deck) return setState({ kind: 'missing' });
      if (deck.cardIds.length === 0) return setState({ kind: 'empty', deck });

      let ids = deck.cardIds;
      if (deck.kind === 'due') {
        // Decided before any card is fetched — never mid-session.
        if (!canStartReview(isPremium, await hasUsedFreeReviewToday(activeProfile.id))) {
          if (!cancelled) setState({ kind: 'allowance-used' });
          return;
        }
        ids = limitReviewQueue(isPremium, ids);
        if (!isPremium) await markFreeReviewStarted(activeProfile.id);
      }

      // Every word in the learner's decks, fetched once: the deck's cards plus
      // the wrong answers for the quiz — only words they've already met.
      const allIds = [...new Set(decks.flatMap((d) => d.cardIds))];
      const [pool, goal] = await Promise.all([fetchFlashcards(allIds), fetchDailyGoalSettings(activeProfile.id)]);
      if (cancelled) return;
      const byId = new Map(pool.map((c) => [c.id, c]));
      const cards = ids.map((id) => byId.get(id)).filter((c): c is WordGroupWithVariants => c !== undefined);
      setState({ kind: 'ready', cards, pool, goalMinutes: goal?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES });
      prefetchLessonAudio(cards.flatMap((c) => c.variants));
    })().catch(() => !cancelled && setState({ kind: 'missing' }));
    return () => {
      cancelled = true;
    };
  }, [activeProfile, deckId, isPremium, isResolved]);

  if (state.kind === 'allowance-used') {
    return (
      <PremiumGate
        title="You've used today's free review"
        message={`The free plan includes one review a day (up to ${FREE_REVIEW_WORD_LIMIT} cards). Your other decks are still open, or come back tomorrow.`}
      />
    );
  }
  if (state.kind === 'ready' && activeProfile) {
    if (state.cards.length > 0) {
      return (
        <FlashcardSession cards={state.cards} distractorPool={state.pool} profileId={activeProfile.id} goalMinutes={state.goalMinutes} />
      );
    }
  }
  if (state.kind === 'loading') return <LoadingScreen themed />;

  const empty =
    state.kind === 'empty'
      ? EMPTY[state.deck.kind]
      : state.kind === 'missing'
        ? { emoji: '🧭', title: 'Deck not found', body: 'This deck isn’t available any more, or it couldn’t load. Check your connection and try again.' }
        : EMPTY.category;

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <View style={styles.center}>
        <Text style={styles.emoji}>{empty.emoji}</Text>
        <Text style={styles.title}>{empty.title}</Text>
        <Text style={styles.body}>{empty.body}</Text>
        <Button themed label="Back to decks" variant="secondary" onPress={() => router.replace('/flashcards')} />
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
    emoji: { fontSize: 48 },
    title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    body: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  });
