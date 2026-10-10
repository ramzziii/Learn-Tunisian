import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors as lightColors, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface BackButtonProps {
  /** Called instead of router.back() — use when "back" should go somewhere specific rather than history-back. */
  onPress?: () => void;
  /** Opts into the live light/dark theme — see ScreenContainer's `themed`
   * prop for why this defaults to false (safe for screens not yet
   * converted to the theme system). */
  themed?: boolean;
}

/** Renders nothing if there's no previous screen to go back to (e.g. reached this screen directly). */
export function BackButton({ onPress, themed = false }: BackButtonProps) {
  const { colors: liveColors } = useTheme();
  const colors = themed ? liveColors : lightColors;
  const styles = makeStyles(colors);

  if (!onPress && !router.canGoBack()) return null;

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      accessibilityLabel="Go back"
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.icon}>‹</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
    },
    pressed: { opacity: 0.7 },
    icon: { fontSize: 24, color: colors.textPrimary, fontWeight: '700', marginTop: -2 },
  });
