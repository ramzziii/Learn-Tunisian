import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors as lightColors, radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface SelectableCardProps {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
  /** Opts into the live light/dark theme — see ScreenContainer's `themed`
   * prop for why this defaults to false. */
  themed?: boolean;
}

export function SelectableCard({ title, subtitle, selected, onPress, themed = false }: SelectableCardProps) {
  const live = useTheme();
  const colors = themed ? live.colors : lightColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {selected ? <View style={styles.check} /> : null}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: spacing.sm,
    },
    // A translucent tint of the theme's own primary color rather than a
    // hardcoded light-blue hex — this is what makes it work correctly in
    // both palettes without a dedicated "selected" token.
    selected: { borderColor: colors.primary, backgroundColor: `${colors.primary}1A` },
    pressed: { opacity: 0.85 },
    title: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    titleSelected: { color: colors.primaryDark },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
    },
  });
