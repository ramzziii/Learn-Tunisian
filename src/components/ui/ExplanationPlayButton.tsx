import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { getAudioUrl } from '@/lib/supabase/client';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { WordVariant } from '@/types/models';

interface ExplanationPlayButtonProps {
  variant: Pick<WordVariant, 'explanationAudioPath' | 'updatedAt'> | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Play explanation" — a native speaker explaining the word or phrase (in
 * English, Arabic or both). Separate from the pronunciation's play button,
 * never auto-plays, and renders nothing at all when there's no explanation.
 */
export function ExplanationPlayButton({ variant, style }: ExplanationPlayButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [failed, setFailed] = useState(false);

  const path = variant?.explanationAudioPath ?? null;
  if (!path) return null;

  const play = async () => {
    setFailed(false);
    const uri = getAudioUrl(path, variant?.updatedAt);
    if (!uri) {
      setFailed(true);
      return;
    }
    try {
      player.replace({ uri });
      await player.seekTo(0);
      player.play();
    } catch {
      setFailed(true);
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Play explanation" onPress={play} style={styles.button}>
        <Text style={styles.icon}>{status.playing ? '🔊' : '💬'}</Text>
        <Text style={styles.label}>Play explanation</Text>
      </PressableScale>
      {failed ? <Text style={styles.error}>Couldn&apos;t play the explanation — check your connection and try again.</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: spacing.xs },
    button: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: radii.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    icon: { fontSize: 14 },
    label: { fontSize: 14, fontWeight: '700', color: colors.primary },
    error: { fontSize: 12, color: colors.error, textAlign: 'center' },
  });
