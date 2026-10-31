import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { FormDisplay } from '@/components/tunisian/FormDisplay';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { recordWordGroupResult } from '@/data/progress';
import { recordSessionLog } from '@/data/sessionLogs';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import {
  FLASHCARD_BATCH_SIZE,
  FLASHCARD_RATINGS,
  ratingWasCorrect,
  type FlashcardDirection,
  type FlashcardRating,
} from '@/lib/flashcards';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { WordGroupWithVariants } from '@/types/models';

interface FlashcardSessionProps {
  cards: WordGroupWithVariants[];
  profileId: string;
  goalMinutes: number;
  initialDirection?: FlashcardDirection;
}

/**
 * Study a deck: flip a card, then Missed it / Almost / Got it. Each card shown
 * is rated at most once, through the existing recordWordGroupResult (so it
 * moves the same spaced-repetition schedule as lessons and Review). Runs on
 * the standard session timer and logs its minutes as a 'review' session, so
 * it counts toward the daily goal. Stops after a batch with the standard
 * completion card: Another batch, Add more time (this session only) or Back
 * to home.
 *
 * Ratings need a connection — there is no offline queue. A rating that can't
 * be saved is reported on screen and the session carries on.
 */
export function FlashcardSession({ cards, profileId, goalMinutes, initialDirection = 'tunisian-first' }: FlashcardSessionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const timer = useSessionTimer(goalMinutes);
  const [direction, setDirection] = useState<FlashcardDirection>(initialDirection);
  // Index of the card on screen; every card before it has been rated.
  const [shown, setShown] = useState(0);
  const [batchEnd, setBatchEnd] = useState(Math.min(FLASHCARD_BATCH_SIZE, cards.length));
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const [unsaved, setUnsaved] = useState(0);
  const ratedRef = useRef(new Set<number>());
  const hasLoggedRef = useRef(false);

  const card = shown < batchEnd ? cards[shown] : null;
  const batchDone = shown >= batchEnd;
  const remaining = cards.length - shown;

  const rate = (index: number, rating: FlashcardRating) => {
    // One rating per card shown, whatever is tapped or tapped twice.
    if (ratedRef.current.has(index) || !cards[index]) return;
    ratedRef.current.add(index);
    const wasCorrect = ratingWasCorrect(rating);
    recordWordGroupResult(profileId, cards[index].id, wasCorrect).catch(() => setUnsaved((n) => n + 1));
    setStats((s) => ({ correct: s.correct + (wasCorrect ? 1 : 0), incorrect: s.incorrect + (wasCorrect ? 0 : 1) }));
    setRevealed(false);
    setShown(index + 1);
  };

  const startNextBatch = () => setBatchEnd(Math.min(shown + FLASHCARD_BATCH_SIZE, cards.length));

  const logAndExit = useCallback(
    (to: Href) => {
      if (!hasLoggedRef.current && timer.elapsedSeconds > 0) {
        hasLoggedRef.current = true;
        recordSessionLog(profileId, 'review', timer.elapsedSeconds).catch(() => {
          // Best-effort, like every other session — never blocks leaving.
        });
      }
      router.replace(to);
    },
    [profileId, timer.elapsedSeconds]
  );

  const meaningFirst = direction === 'meaning-first';
  const showTunisian = !meaningFirst || revealed;
  const showMeaning = meaningFirst || revealed;

  return (
    <ScreenContainer themed>
      <View style={styles.header}>
        <PressableScale haptic onPress={() => logAndExit('/flashcards')} accessibilityRole="button" accessibilityLabel="Exit flashcards" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <ProgressBar themed progress={timer.goalSeconds > 0 ? timer.elapsedSeconds / timer.goalSeconds : 0} />
        </View>
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.counter}>{card ? `Card ${shown + 1} of ${batchEnd}` : ''}</Text>
        <Pressable
          onPress={() => {
            setDirection(meaningFirst ? 'tunisian-first' : 'meaning-first');
            setRevealed(false);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            meaningFirst ? 'Showing meaning first. Switch to Tunisian first' : 'Showing Tunisian first. Switch to meaning first'
          }
          hitSlop={8}
          style={styles.directionToggle}
        >
          <Text style={styles.directionText}>{meaningFirst ? 'Meaning → Tunisian' : 'Tunisian → Meaning'} ⇄</Text>
        </Pressable>
      </View>

      {card ? (
        <ScrollView contentContainerStyle={styles.cardArea} showsVerticalScrollIndicator={false}>
          <View key={`${shown}-${direction}`} style={styles.card}>
            {showMeaning && meaningFirst ? <Text style={styles.meaning}>{card.englishMeaning}</Text> : null}
            {showTunisian ? <FormDisplay group={card} size="xl" /> : null}
            {showMeaning && !meaningFirst ? <Text style={[styles.meaning, styles.meaningBack]}>{card.englishMeaning}</Text> : null}
          </View>

          {revealed ? (
            <View style={styles.ratings}>
              {FLASHCARD_RATINGS.map(({ rating, label }) => (
                <Button
                  themed
                  key={rating}
                  label={label}
                  variant={rating === 'got_it' ? 'primary' : 'secondary'}
                  onPress={() => rate(shown, rating)}
                  style={styles.ratingButton}
                />
              ))}
            </View>
          ) : (
            <Button themed label="Show answer" onPress={() => setRevealed(true)} style={{ marginTop: spacing.lg }} />
          )}

          {unsaved > 0 ? (
            <Text style={styles.unsaved} accessibilityLiveRegion="polite">
              {unsaved === 1 ? '1 rating' : `${unsaved} ratings`} not saved — check your connection.
            </Text>
          ) : null}
        </ScrollView>
      ) : null}

      {batchDone || timer.isComplete ? (
        <SessionCompleteCard
          minutesLearned={Math.max(1, Math.round(timer.elapsedSeconds / 60))}
          wordsCount={shown}
          correctCount={stats.correct}
          incorrectCount={stats.incorrect}
          sessionType="review"
          onClose={() => logAndExit('/home')}
          onAddMore={
            !batchDone || remaining > 0
              ? (minutes) => {
                  timer.addMinutes(minutes);
                  if (batchDone) startNextBatch();
                }
              : undefined
          }
          onAnotherBatch={batchDone && remaining > 0 && !timer.isComplete ? startNextBatch : undefined}
        />
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    closeIcon: { fontSize: 16, color: colors.textSecondary },
    toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    counter: { fontSize: 13, color: colors.textSecondary },
    directionToggle: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface },
    directionText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    cardArea: { paddingBottom: spacing.xl },
    card: {
      minHeight: 220,
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    meaning: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    meaningBack: { fontSize: 18, fontWeight: '600', marginTop: spacing.sm },
    ratings: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    ratingButton: { flex: 1 },
    unsaved: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  });
