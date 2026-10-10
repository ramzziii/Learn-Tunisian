import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import {
  colors as lightColors,
  gradients as lightGradients,
  radii,
  shadows,
  spacing,
  type ThemeColors,
} from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Opts into the live light/dark theme — see ScreenContainer's `themed`
   * prop for why this defaults to false (safe for screens not yet
   * converted to the theme system). */
  themed?: boolean;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style, themed = false }: ButtonProps) {
  const live = useTheme();
  const colors = themed ? live.colors : lightColors;
  const gradients = themed ? live.gradients : lightGradients;
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
