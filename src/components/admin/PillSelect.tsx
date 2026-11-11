import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FieldHelp } from '@/components/admin/FieldHelp';
import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import type { FieldHelpKey } from '@/lib/admin/fieldHelp';
import { useTheme } from '@/lib/theme/ThemeContext';

interface PillOption {
  value: string;
  label: string;
}

interface PillSelectProps {
  label: string;
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
  /** Adds an ⓘ next to the label that explains the field. */
  help?: FieldHelpKey;
}

/** Generalizes the pill-row pattern app/admin/corrections.tsx hand-rolled for
 * its "Promote into" field, so it isn't re-duplicated across every new admin
 * form (variant_label, content_status, is_curriculum). */
export function PillSelect({ label, options, value, onChange, help }: PillSelectProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {help ? (
        <FieldHelp label={label} help={help} labelStyle={styles.label} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { marginTop: spacing.sm },
    label: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    option: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.pill,
      paddingVertical: 4,
      paddingHorizontal: spacing.md,
    },
    optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionText: { fontSize: 12, color: colors.textPrimary },
    optionTextSelected: { color: colors.textOnPrimary, fontWeight: '700' },
  });
