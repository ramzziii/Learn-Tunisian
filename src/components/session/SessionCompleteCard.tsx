import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, gradients, radii, shadows, spacing } from '@/constants/theme';
import type { DailyGoalMinutes } from '@/types/models';

const ADD_MORE_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];

interface SessionCompleteCardProps {
  minutesLearned: number;
  onClose: () => void;
  onAddMore: (minutes: DailyGoalMinutes) => void;
}

/**
 * Every session's natural stopping point: a positive completion message with
 * exactly two choices, "Close" or "Add more time" — never an auto-advance
 * into more content.
 */
export function SessionCompleteCard({ minutesLearned, onClose, onAddMore }: SessionCompleteCardProps) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [pop]);

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.card,
          shadows.raised,
          {
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          },
        ]}
      >
        <LinearGradient colors={gradients.celebration} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <Text style={styles.emoji}>🎉</Text>
        </LinearGradient>

        <Text style={styles.title}>Great job!</Text>
        <Text style={styles.subtitle}>
          You completed your learning for today ({minutesLearned} {minutesLearned === 1 ? 'minute' : 'minutes'}).
        </Text>

        <Button label="Close" onPress={onClose} style={{ marginTop: spacing.xl, width: '100%' }} />

        <Text style={styles.addMoreLabel}>Want to keep going?</Text>
        <View style={styles.addMoreRow}>
          {ADD_MORE_OPTIONS.map((minutes) => (
            <PressableScale key={minutes} style={styles.addMoreButton} onPress={() => onAddMore(minutes)}>
              <Text style={styles.addMoreButtonText}>+{minutes} min</Text>
            </PressableScale>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(36, 32, 33, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emoji: { fontSize: 48 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  addMoreLabel: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm },
  addMoreRow: { flexDirection: 'row', gap: spacing.sm },
  addMoreButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addMoreButtonText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
