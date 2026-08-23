import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

interface SelectableCardProps {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
}

export function SelectableCard({ title, subtitle, selected, onPress }: SelectableCardProps) {
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

const styles = StyleSheet.create({
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
  selected: { borderColor: colors.primary, backgroundColor: '#EAF3FA' },
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
