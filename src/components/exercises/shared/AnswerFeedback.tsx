import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TunisianText } from '@/components/tunisian/TunisianText';
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
  /** Script exemptions for exercises that test a script (see TunisianText). */
  alwaysShowArabic?: boolean;
  alwaysShowLatin?: boolean;
  /** Next was tapped, or the countdown finished. Fires once. */
  onNext: () => void;
}

/**
 * The result pop-up after a reading or typing answer: "Great job!" or
 * "Not quite" (with the right answer, so a miss teaches), a Next button and a
 * countdown from 3 that moves on by itself.
 */
export function AnswerFeedback({
  isCorrect,
  correctWordArabic,
  correctTransliteration,
  correctMeaning,
  alwaysShowArabic,
  alwaysShowLatin,
  onNext,
}: AnswerFeedbackProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <FeedbackSheet
      visible
      tone={isCorrect ? 'success' : 'error'}
      icon={isCorrect ? '🎉' : '❌'}
      title={isCorrect ? 'Great job!' : 'Not quite'}
      message={isCorrect ? 'That’s the one.' : correctWordArabic ? 'Here’s the right answer:' : undefined}
      autoAdvanceSeconds={ANSWER_AUTO_ADVANCE_SECONDS}
      onPrimary={onNext}
    >
      {!isCorrect && correctWordArabic ? (
        <View style={styles.answer}>
          <TunisianText
            arabic={correctWordArabic}
            latin={correctTransliteration}
            size="xl"
            alwaysShowArabic={alwaysShowArabic}
            alwaysShowLatin={alwaysShowLatin}
            arabicStyle={styles.wordArabic}
            latinStyle={styles.transliteration}
            style={styles.word}
          />
          {correctMeaning ? <Text style={styles.meaning}>{correctMeaning}</Text> : null}
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
    word: { alignItems: 'center' },
    wordArabic: { fontSize: 30, fontWeight: '700', color: colors.textPrimary },
    transliteration: { fontSize: 16, color: colors.textSecondary, fontStyle: 'italic' },
    meaning: { fontSize: 16, color: colors.textSecondary, textTransform: 'capitalize', marginTop: 2 },
  });
