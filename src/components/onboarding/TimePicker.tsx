import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

const MINUTE_OPTIONS = [0, 15, 30, 45];

interface TimePickerProps {
  hour24: number; // 0-23
  minute: number; // 0-59
  onChange: (hour24: number, minute: number) => void;
}

function to12Hour(hour24: number): { hour12: number; isPm: boolean } {
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, isPm };
}

function to24Hour(hour12: number, isPm: boolean): number {
  const base = hour12 % 12;
  return isPm ? base + 12 : base;
}

export function TimePicker({ hour24, minute, onChange }: TimePickerProps) {
  const { hour12, isPm } = to12Hour(hour24);

  const changeHour12 = (delta: number) => {
    const next = ((hour12 - 1 + delta + 12) % 12) + 1;
    onChange(to24Hour(next, isPm), minute);
  };

  const closestMinuteOption = MINUTE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - minute) < Math.abs(closest - minute) ? option : closest
  );

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.stepper}>
          <Pressable style={styles.stepperButton} onPress={() => changeHour12(-1)} accessibilityLabel="Earlier hour">
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.hourText}>{hour12}</Text>
          <Pressable style={styles.stepperButton} onPress={() => changeHour12(1)} accessibilityLabel="Later hour">
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.ampmGroup}>
          {(['AM', 'PM'] as const).map((label) => {
            const selected = label === 'PM' ? isPm : !isPm;
            return (
              <Pressable
                key={label}
                onPress={() => onChange(to24Hour(hour12, label === 'PM'), minute)}
                style={[styles.ampmButton, selected && styles.ampmButtonSelected]}
              >
                <Text style={[styles.ampmText, selected && styles.ampmTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.minuteRow}>
        {MINUTE_OPTIONS.map((option) => {
          const selected = option === closestMinuteOption;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(hour24, option)}
              style={[styles.minuteButton, selected && styles.minuteButtonSelected]}
            >
              <Text style={[styles.minuteText, selected && styles.minuteTextSelected]}>
                :{String(option).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 22, color: colors.primary, fontWeight: '700' },
  hourText: { fontSize: 40, fontWeight: '700', color: colors.textPrimary, minWidth: 56, textAlign: 'center' },
  ampmGroup: { gap: spacing.xs },
  ampmButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  ampmButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  ampmText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  ampmTextSelected: { color: '#fff' },
  minuteRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  minuteButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  minuteButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  minuteText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  minuteTextSelected: { color: '#fff' },
});
