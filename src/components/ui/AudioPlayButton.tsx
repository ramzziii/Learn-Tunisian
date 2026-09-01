import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, shadows } from '@/constants/theme';

interface AudioPlayButtonProps {
  onPress: () => void;
  hasAudio: boolean;
  isResolving: boolean;
  /** True when this word has audio but it failed to load this time (e.g. offline) — renders as tappable-to-retry instead of flatly disabled. */
  hasError?: boolean;
  onRetry?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The single play-audio control used across every exercise type and the
 * word detail screen — one place to get "easy to find, large enough,
 * reliable" right, instead of four near-duplicate buttons drifting apart.
 * Disabled (not just dimmed) while resolving so a tap can't fire against a
 * source that isn't ready yet. Distinguishes "genuinely no audio for this
 * word" (disabled) from "failed to load, worth another try" (tappable, with
 * a retry icon) rather than treating both as an identical dead button.
 */
export function AudioPlayButton({
  onPress,
  hasAudio,
  isResolving,
  hasError = false,
  onRetry,
  size = 72,
  style,
}: AudioPlayButtonProps) {
  const isRetryable = hasError && !!onRetry;
  const disabled = (!hasAudio && !isRetryable) || isResolving;

  return (
    <PressableScale
      onPress={isRetryable ? onRetry : onPress}
      disabled={disabled}
      accessibilityLabel={isResolving ? 'Loading audio' : isRetryable ? 'Retry loading audio' : 'Play audio'}
      accessibilityRole="button"
      style={[
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        shadows.card,
        isRetryable && styles.retry,
        disabled && styles.disabled,
        style,
      ]}
    >
      {isResolving ? (
        <ActivityIndicator color={colors.textOnPrimary} />
      ) : (
        <Text style={{ fontSize: size * 0.4 }}>{isRetryable ? '↻' : '🔊'}</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: { backgroundColor: colors.accent },
  disabled: { opacity: 0.4 },
});
