import { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';

interface ParentGateModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max) + 1;
}

/**
 * A quick "are you the parent?" check before leaving the kid-facing
 * experience for Settings or profile-switching — a simple math question a
 * young child can't answer, not a real security boundary. No persistence,
 * no new dependency.
 */
export function ParentGateModal({ onSuccess, onCancel }: ParentGateModalProps) {
  const [a, b] = useMemo(() => [randomInt(8), randomInt(8)], []);
  const correctAnswer = a + b;
  const [wasWrong, setWasWrong] = useState(false);

  const options = useMemo(() => {
    const distractors = new Set<number>();
    while (distractors.size < 3) {
      const candidate = correctAnswer + (randomInt(6) - 3);
      if (candidate !== correctAnswer && candidate >= 0) distractors.add(candidate);
    }
    return [...distractors, correctAnswer].sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (value: number) => {
    if (value === correctAnswer) {
      onSuccess();
    } else {
      setWasWrong(true);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, shadows.raised]}>
          <Text style={styles.eyebrow}>Parents only</Text>
          <Text style={styles.question}>
            What&apos;s {a} + {b}?
          </Text>
          <View style={styles.optionsRow}>
            {options.map((value) => (
              <PressableScale key={value} haptic style={styles.option} onPress={() => choose(value)}>
                <Text style={styles.optionText}>{value}</Text>
              </PressableScale>
            ))}
          </View>
          {wasWrong ? <Text style={styles.errorText}>Not quite — try again.</Text> : null}
          <PressableScale onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(36, 32, 33, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  question: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg, justifyContent: 'center' },
  option: {
    width: 64,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  errorText: { fontSize: 13, color: colors.error, marginTop: spacing.md },
  cancelButton: { marginTop: spacing.lg, padding: spacing.sm },
  cancelText: { fontSize: 14, color: colors.textSecondary },
});
