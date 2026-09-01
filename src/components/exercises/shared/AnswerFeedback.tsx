import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, spacing } from '@/constants/theme';

interface AnswerFeedbackProps {
  isCorrect: boolean;
  correctWordArabic?: string;
  correctTransliteration?: string;
  correctMeaning?: string;
  /** Replays the correct word's audio — shown only when provided, so an incorrect answer teaches rather than just says "wrong." */
  onListenAgain?: () => void;
}

export function AnswerFeedback({
  isCorrect,
  correctWordArabic,
  correctTransliteration,
  correctMeaning,
  onListenAgain,
}: AnswerFeedbackProps) {
  if (isCorrect) {
    return (
      <View style={[styles.banner, styles.correct]}>
        <Text style={styles.correctText}>Nice! That&apos;s correct.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.banner, styles.incorrect]}>
      <Text style={styles.notQuiteText}>Not quite.</Text>
      {correctWordArabic ? (
        <View style={styles.wordRow}>
          <Text style={styles.wordArabic}>{correctWordArabic}</Text>
          {correctTransliteration ? <Text style={styles.transliteration}>{correctTransliteration}</Text> : null}
          {correctMeaning ? <Text style={styles.meaning}>{correctMeaning}</Text> : null}
        </View>
      ) : null}
      {onListenAgain ? (
        <PressableScale onPress={onListenAgain} style={styles.listenAgainButton}>
          <Text style={styles.listenAgainText}>🔊 Listen again</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    alignItems: 'center',
  },
  correct: { backgroundColor: '#E3F5EA' },
  incorrect: { backgroundColor: '#FBEAE6' },
  correctText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  notQuiteText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  wordRow: { alignItems: 'center', marginTop: spacing.sm },
  wordArabic: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  transliteration: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  meaning: { fontSize: 14, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  listenAgainButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  listenAgainText: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
