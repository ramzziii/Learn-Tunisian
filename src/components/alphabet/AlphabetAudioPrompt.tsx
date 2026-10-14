import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

interface AlphabetAudioPromptProps {
  label: string;
  onPress: () => void;
  isSpeaking: boolean;
}

/** The audio-circle + prompt-text row shown at the top of every listening exercise. */
export function AlphabetAudioPrompt({ label, onPress, isSpeaking }: AlphabetAudioPromptProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <PressableScale onPress={onPress} style={[styles.circle, isSpeaking && styles.circleActive]}>
        <Text style={styles.icon}>🔊</Text>
      </PressableScale>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
    circle: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.card,
    },
    circleActive: { opacity: 0.75 },
    icon: { fontSize: 30 },
    label: { fontSize: 22, color: colors.textPrimary, marginLeft: spacing.md, fontWeight: '600', flexShrink: 1 },
  });
