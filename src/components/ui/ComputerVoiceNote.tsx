import { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

export const COMPUTER_VOICE_NOTE = 'Computer voice — not a Tunisian speaker';

/**
 * Shown wherever placeholder audio can play (seeded text-to-speech in Modern
 * Standard Arabic, is_native_voice = false): it plays only when tapped, and
 * this says plainly that it isn't Tunisian. See useWordAudioPlayer's `source`.
 */
export function ComputerVoiceNote({ style }: { style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={[styles.note, style]}>{COMPUTER_VOICE_NOTE}</Text>;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    note: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' },
  });
