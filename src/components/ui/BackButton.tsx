import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/constants/theme';

interface BackButtonProps {
  /** Called instead of router.back() — use when "back" should go somewhere specific rather than history-back. */
  onPress?: () => void;
}

/** Renders nothing if there's no previous screen to go back to (e.g. reached this screen directly). */
export function BackButton({ onPress }: BackButtonProps) {
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

const styles = StyleSheet.create({
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
