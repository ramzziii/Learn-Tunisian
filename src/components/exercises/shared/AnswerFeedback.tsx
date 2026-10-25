import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackSheet } from '@/components/ui/FeedbackSheet';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Seconds the result pop-up waits before moving on by itself. */
export const ANSWER_AUTO_ADVANCE_SECONDS = 3;

interface AnswerFeedbackProps {
  isCorrect: boolean;
  correctWordArabic?: string;
  correctTransliteration?: string;
  correctMeaning?: string;
  /** Next was tapped, or the countdown finished. Fires once. */
  onNext: () => void;
  /** Warmer, more game-like copy for the kid track — same pop-up, softer
   * wording and no ❌ on a miss. */
  kidFriendly?: boolean;
}

/**
 * The result pop-up after a reading/typing/listen answer: "Great job!" or
 * "Not quite" (with the right answer, so a miss teaches), a Next button and a
 * countdown from 3 that moves on by itself.
 */
export function AnswerFeedback({
  isCorrect,
  correctWordArabic,
  correctTransliteration,
  correctMeaning,
  onNext,
  kidFriendly = false,
}: AnswerFeedbackProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <FeedbackSheet
      visible
      tone={isCorrect ? 'success' : 'error'}
      icon={isCorrect ? (kidFriendly ? '🎉' : '🎉') : kidFriendly ? '🌟' : '❌'}
      title={isCorrect ? (kidFriendly ? 'Yay! You got it!' : 'Great job!') : kidFriendly ? "Almost! Let's try that again." : 'Not quite'}
      message={isCorrect ? 'That’s the one.' : correctWordArabic ? 'Here’s the right answer:' : undefined}
      autoAdvanceSeconds={ANSWER_AUTO_ADVANCE_SECONDS}
      onPrimary={onNext}
    >
      {!isCorrect && correctWordArabic ? (
        <View style={styles.answer}>
          <Text style={styles.wordArabic}>{correctWordArabic}</Text>
          {correctTransliteration || correctMeaning ? (
            <View style={styles.detailRow}>
              {correctTransliteration ? <Text style={styles.transliteration}>{correctTransliteration}</Text> : null}
              {correctTransliteration && correctMeaning ? <Text style={styles.dot}>·</Text> : null}
              {correctMeaning ? <Text style={styles.meaning}>{correctMeaning}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </FeedbackSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    answer: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      backgroundColor: `${colors.error}10`,
    },
    wordArabic: { fontSize: 30, fontWeight: '700', color: colors.textPrimary },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' },
    transliteration: { fontSize: 16, color: colors.textSecondary, fontStyle: 'italic' },
    dot: { fontSize: 16, color: colors.textSecondary },
    meaning: { fontSize: 16, color: colors.textSecondary, textTransform: 'capitalize' },
  });
