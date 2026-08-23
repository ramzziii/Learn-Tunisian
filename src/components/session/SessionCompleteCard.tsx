import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/constants/theme';
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
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Great job!</Text>
        <Text style={styles.subtitle}>
          You completed your learning for today ({minutesLearned} {minutesLearned === 1 ? 'minute' : 'minutes'}).
        </Text>

        <Button label="Close" onPress={onClose} style={{ marginTop: spacing.xl }} />

        <Text style={styles.addMoreLabel}>Want to keep going?</Text>
        <View style={styles.addMoreRow}>
          {ADD_MORE_OPTIONS.map((minutes) => (
            <Pressable key={minutes} style={styles.addMoreButton} onPress={() => onAddMore(minutes)}>
              <Text style={styles.addMoreButtonText}>+{minutes} min</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(36, 32, 33, 0.4)',
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
  emoji: { fontSize: 56 },
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
