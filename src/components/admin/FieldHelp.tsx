import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { FIELD_HELP, type FieldHelpKey } from '@/lib/admin/fieldHelp';
import { useTheme } from '@/lib/theme/ThemeContext';

/**
 * Admin: a field's name with an ⓘ that shows or hides a short explanation
 * of what to put there (texts in src/lib/admin/fieldHelp.ts). `children`
 * replaces the plain name when the row is something else (a checkbox, a
 * switch).
 */
export function FieldHelp({
  label,
  help,
  labelStyle,
  children,
}: {
  label: string;
  help: FieldHelpKey;
  labelStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  return (
    <View>
      <View style={styles.row}>
        {children ?? <Text style={labelStyle}>{label}</Text>}
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel={`What is “${label}”?`}
          accessibilityState={{ expanded: open }}
          hitSlop={10}
          style={styles.info}
        >
          <Text style={styles.infoText}>ⓘ</Text>
        </Pressable>
      </View>
      {open ? (
        <Text style={styles.help} accessibilityLiveRegion="polite">
          {FIELD_HELP[help]}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    info: { minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
    infoText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    help: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      backgroundColor: `${colors.primary}10`,
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginTop: 4,
      marginBottom: spacing.xs,
    },
  });
