import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, shadows, spacing } from '@/constants/theme';

interface AlphabetAudioPromptProps {
  label: string;
  onPress: () => void;
  isSpeaking: boolean;
}

/** The audio-circle + prompt-text row shown at the top of every listening exercise. */
export function AlphabetAudioPrompt({ label, onPress, isSpeaking }: AlphabetAudioPromptProps) {
  return (
    <View style={styles.row}>
      <PressableScale onPress={onPress} style={[styles.circle, isSpeaking && styles.circleActive]}>
        <Text style={styles.icon}>🔊</Text>
      </PressableScale>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
