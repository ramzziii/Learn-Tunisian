import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { FormDisplay } from '@/components/tunisian/FormDisplay';
import { TunisianText } from '@/components/tunisian/TunisianText';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { recordWordGroupResult } from '@/data/progress';
import { recordSessionLog } from '@/data/sessionLogs';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { preferredVariant } from '@/lib/display/displayRules';
import { useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
import {
  buildFlashcardQuestion,
  canQuiz,
  FLASHCARD_BATCH_SIZE,
  isCorrectChoice,
  type FlashcardChoice,
  type FlashcardDirection,
} from '@/lib/flashcards';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { WordGroupWithVariants } from '@/types/models';

interface FlashcardSessionProps {
  cards: WordGroupWithVariants[];
  /** Other words the learner has met, for wrong answers (the deck's own cards are always included). */
  distractorPool?: WordGroupWithVariants[];
  profileId: string;
  goalMinutes: number;
  initialDirection?: FlashcardDirection;
}

/**
 * Study a deck as a quiz: each card asks "What does this mean?" (Tunisian →
 * meaning) or "Which is the Tunisian?" (meaning → Tunisian) with answer
 * choices built from other words. The word's own recording plays by itself —
 * as the card appears, or after answering for meaning → Tunisian (before would
 * give it away); a form with no recording stays silent. The app checks the
 * answer, shows the standard result sheet ("Great job!" / "Not quite" with the
 * right answer, Next with a countdown), and records one result per card through
 * the existing recordWordGroupResult (right → correct, wrong → incorrect), so
 * it moves the same spaced-repetition schedule as lessons and Review. A card
 * without enough fair wrong answers is skipped. Runs on the standard session
 * timer and logs its minutes as a 'review' session, so it counts toward the
 * daily goal. Stops after a batch with the standard completion card.
 *
 * Results need a connection — there is no offline queue. A result that can't
 * be saved is reported on screen and the session carries on.
 */
export function FlashcardSession({
  cards: deckCards,
  distractorPool = [],
  profileId,
  goalMinutes,
  initialDirection = 'tunisian-first',
}: FlashcardSessionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { preferences } = useDisplayPreferences();
  const timer = useSessionTimer(goalMinutes);
  const [direction, setDirection] = useState<FlashcardDirection>(initialDirection);

  const pool = useMemo(() => {
    const byId = new Map([...deckCards, ...distractorPool].map((g) => [g.id, g]));
    return [...byId.values()];
  }, [deckCards, distractorPool]);
  // Only cards that can be asked fairly in both directions, so switching never strands one.
  const cards = useMemo(() => deckCards.filter((c) => canQuiz(c, pool, preferences.form)), [deckCards, pool, preferences.form]);

  // Index of the card on screen; every card before it has been answered.
  const [shown, setShown] = useState(0);
  const [batchEnd, setBatchEnd] = useState(Math.min(FLASHCARD_BATCH_SIZE, cards.length));
  const [answer, setAnswer] = useState<{ index: number; groupId: string; correct: boolean } | null>(null);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const [unsaved, setUnsaved] = useState(0);
  const answeredRef = useRef(new Set<number>());
  const hasLoggedRef = useRef(false);

  const card = shown < batchEnd ? cards[shown] : null;
  const batchDone = shown >= batchEnd;
  const remaining = cards.length - shown;
  const question = useMemo(
    () => (card ? buildFlashcardQuestion(card, pool, direction, preferences.form) : null),
    // Rebuilt per card shown and per direction — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card?.id, shown, direction, preferences.form, pool]
  );
  const answered = answer !== null && answer.index === shown;
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  // Plays the card's word by itself: as it appears (Tunisian → meaning), or
  // once answered (meaning → Tunisian). Only a real recording — never a
  // device voice standing in for a missing one.
  const cardVariant = card ? preferredVariant(card, preferences.form) : null;
  const autoPlayVariant = cardVariant?.audioPath && (direction === 'tunisian-first' || answered) ? cardVariant : null;
  useWordAudioPlayer(autoPlayVariant, { autoPlay: true, fallbackVoice: false });

  const choose = (index: number, choice: FlashcardChoice) => {
    // One result per card shown, whatever is tapped or tapped twice.
    if (answeredRef.current.has(index) || !question || !cards[index]) return;
    answeredRef.current.add(index);
    const correct = isCorrectChoice(question, choice.groupId);
    if (correct) playCorrect();
    else playIncorrect();
    recordWordGroupResult(profileId, cards[index].id, correct).catch(() => setUnsaved((n) => n + 1));
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), incorrect: s.incorrect + (correct ? 0 : 1) }));
    setAnswer({ index, groupId: choice.groupId, correct });
  };

  const goOn = (index: number) => {
    setAnswer(null);
    setShown((current) => (current === index ? index + 1 : current));
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

  if (cards.length === 0) {
    return (
      <ScreenContainer themed>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🧩</Text>
          <Text style={styles.emptyTitle}>Not enough words for a quiz yet</Text>
          <Text style={styles.emptyBody}>
            Each question needs a few different words to choose from. Practise a few more words in lessons or the
            phrasebook, then come back.
          </Text>
          <Button themed label="Back to decks" variant="secondary" onPress={() => router.replace('/flashcards')} />
        </View>
      </ScreenContainer>
    );
  }

  const meaningFirst = direction === 'meaning-first';

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
          onPress={() => setDirection(meaningFirst ? 'tunisian-first' : 'meaning-first')}
          disabled={answered}
          accessibilityRole="button"
          accessibilityState={{ disabled: answered }}
          accessibilityLabel={
            meaningFirst ? 'Showing meaning first. Switch to Tunisian first' : 'Showing Tunisian first. Switch to meaning first'
          }
          hitSlop={8}
          style={[styles.directionToggle, answered && { opacity: 0.5 }]}
        >
          <Text style={styles.directionText}>{meaningFirst ? 'Meaning → Tunisian' : 'Tunisian → Meaning'} ⇄</Text>
        </Pressable>
      </View>

      {card && question ? (
        <ScrollView contentContainerStyle={styles.cardArea} showsVerticalScrollIndicator={false}>
          <View key={`${shown}-${direction}`} style={styles.card}>
            {meaningFirst ? (
              <>
                <Text style={styles.meaning}>{card.englishMeaning}</Text>
                <Text style={styles.prompt}>Which is the Tunisian?</Text>
              </>
            ) : (
              <>
                {/* Its play button only plays — it never answers. */}
                <FormDisplay group={card} size="xl" />
                <Text style={styles.prompt}>What does this mean?</Text>
              </>
            )}
          </View>

          <View style={styles.choices}>
            {question.choices.map((choice) => {
              const isPicked = answered && answer.groupId === choice.groupId;
              const isRight = choice.groupId === question.targetId;
              const label = choice.variant ? `${choice.variant.wordArabic} (${choice.variant.transliteration})` : choice.label;
              // Once answered: the right choice is always shown (green), and a
              // wrong pick is marked (red) — in words too, not by colour alone.
              const mark = !answered ? null : isRight ? 'right' : isPicked ? 'wrong' : null;
              return (
                <PressableScale
                  key={choice.groupId}
                  scaleTo={0.98}
                  onPress={() => choose(shown, choice)}
                  disabled={answered}
                  accessibilityRole="button"
                  accessibilityLabel={`Answer: ${label}`}
                  accessibilityState={{ disabled: answered, selected: isPicked }}
                  accessibilityValue={
                    mark === 'right' ? { text: 'Correct answer' } : mark === 'wrong' ? { text: 'Your answer, not correct' } : undefined
                  }
                  style={[styles.choice, mark === 'right' && styles.choiceRight, mark === 'wrong' && styles.choiceWrong]}
                >
                  {choice.variant ? (
                    <TunisianText arabic={choice.variant.wordArabic} latin={choice.variant.transliteration} size="md" />
                  ) : (
                    <Text style={styles.choiceText}>{choice.label}</Text>
                  )}
                  {mark ? (
                    <Text style={[styles.markTag, mark === 'right' ? styles.markRight : styles.markWrong]}>
                      {mark === 'right' ? '✓ Correct answer' : '✗ Your answer'}
                    </Text>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>

          {unsaved > 0 ? (
            <Text style={styles.unsaved} accessibilityLiveRegion="polite">
              {unsaved === 1 ? '1 answer' : `${unsaved} answers`} not saved — check your connection.
            </Text>
          ) : null}
        </ScrollView>
      ) : null}

      {card && answered && cardVariant ? (
        <AnswerFeedback
          key={shown}
          isCorrect={answer.correct}
          correctWordArabic={cardVariant.wordArabic}
          correctTransliteration={cardVariant.transliteration}
          correctMeaning={card.englishMeaning}
          onNext={() => goOn(shown)}
        />
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
      minHeight: 160,
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    meaning: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    prompt: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    choices: { gap: spacing.sm, marginTop: spacing.lg },
    choice: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // Same tints as the Review exercises' right/wrong options.
    choiceRight: { borderColor: colors.success, borderWidth: 2.5, backgroundColor: `${colors.success}1F` },
    choiceWrong: { borderColor: colors.error, borderWidth: 2.5, backgroundColor: `${colors.error}1F` },
    markTag: { fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
    markRight: { color: colors.success },
    markWrong: { color: colors.error },
    choiceText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    unsaved: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
    emptyEmoji: { fontSize: 48 },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  });
