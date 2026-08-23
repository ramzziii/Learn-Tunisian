import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

interface AnswerFeedbackProps {
  isCorrect: boolean;
  correctAnswerLabel?: string;
}

export function AnswerFeedback({ isCorrect, correctAnswerLabel }: AnswerFeedbackProps) {
  return (
    <View style={[styles.banner, isCorrect ? styles.correct : styles.incorrect]}>
      <Text style={styles.text}>
        {isCorrect ? 'Nice! That\'s correct.' : correctAnswerLabel ? `Not quite — it's "${correctAnswerLabel}"` : "Not quite, that's okay!"}
      </Text>
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
  },
  correct: { backgroundColor: '#E3F5EA' },
  incorrect: { backgroundColor: '#FBEAE6' },
  text: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
});
