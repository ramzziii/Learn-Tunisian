import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';

interface AlphabetExerciseFooterProps {
  checked: boolean;
  isCorrect: boolean;
  correctAnswerLabel: string;
  canCheck: boolean;
  onCheck: () => void;
  onNext: () => void;
}

/**
 * The Check → feedback → Next flow shared by every alphabet exercise type.
 * Also owns the moment an answer resolves: the correct/incorrect sound +
 * haptic fire exactly once here (on the false→true edge of `checked`), so
 * no individual exercise component has to remember to trigger it itself.
 */
export function AlphabetExerciseFooter({
  checked,
  isCorrect,
  correctAnswerLabel,
  canCheck,
  onCheck,
  onNext,
}: AlphabetExerciseFooterProps) {
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const iconAnim = useRef(new Animated.Value(0)).current;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!checked || firedRef.current) return;
    firedRef.current = true;

    if (isCorrect) playCorrect();
    else playIncorrect();

    bannerAnim.setValue(0);
    iconAnim.setValue(0);
    Animated.timing(bannerAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(80),
      Animated.spring(iconAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 18 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  return (
    <View style={styles.container}>
      {checked ? (
        <Animated.View
          style={[
            styles.banner,
            isCorrect ? styles.correct : styles.incorrect,
            {
              opacity: bannerAnim,
              transform: [
                { translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                { scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Animated.Text style={[styles.icon, { transform: [{ scale: iconAnim }] }]}>
              {isCorrect ? '✓' : '✕'}
            </Animated.Text>
            <Text style={[styles.resultText, { color: isCorrect ? '#2E9F68' : '#E35A53' }]}>
              {isCorrect ? 'Excellent, correct answer!' : 'Your answer is wrong'}
            </Text>
          </View>
          <Text style={styles.correctLabel}>Correct answer</Text>
          <Text style={styles.correctAnswer}>{correctAnswerLabel}</Text>
        </Animated.View>
      ) : null}

      <Button
        label={checked ? 'Next' : 'Check'}
        onPress={checked ? onNext : onCheck}
        disabled={!checked && !canCheck}
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 'auto' },
  banner: { borderRadius: radii.lg, padding: spacing.md, alignItems: 'center', marginBottom: spacing.md },
  correct: { backgroundColor: '#E3F5EA' },
  incorrect: { backgroundColor: '#FBEAE6' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  icon: { fontSize: 20, fontWeight: '800' },
  resultText: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  correctLabel: { marginTop: spacing.sm, fontSize: 14, color: colors.textSecondary },
  correctAnswer: { fontSize: 32, color: colors.textPrimary, marginTop: spacing.xs },
  cta: {},
});
