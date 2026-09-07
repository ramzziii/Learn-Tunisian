import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, gradients, radii, shadows, spacing } from '@/constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const isDisabled = disabled || loading;

  const content = loading ? (
    <ActivityIndicator color={variant === 'primary' ? colors.textOnPrimary : colors.primary} />
  ) : (
    <Text
      style={[
        styles.label,
        variant === 'primary' && styles.labelPrimary,
        variant === 'secondary' && styles.labelSecondary,
        variant === 'ghost' && styles.labelGhost,
      ]}
    >
      {label}
    </Text>
  );

  if (variant === 'primary') {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        onPress={onPress}
        disabled={isDisabled}
        style={[isDisabled && styles.disabled, style]}
      >
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, shadows.card]}
        >
          {content}
        </LinearGradient>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      haptic
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '700' },
  labelPrimary: { color: colors.textOnPrimary },
  labelSecondary: { color: colors.primary },
  labelGhost: { color: colors.textSecondary },
});
