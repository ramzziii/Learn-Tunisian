import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Shown once the main words are done, before the second pass over words the
 * learner didn't pronounce right (see src/lib/speakingRevisit.ts). */
export function RevisitIntro({ count, onStart, onSkip }: { count: number; onStart: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Reveal style={styles.container}>
      <Text style={styles.emoji}>🔁</Text>
      <Text style={styles.title}>Let&apos;s revisit the tricky {count === 1 ? 'word' : 'words'}</Text>
      <Text style={styles.body}>
        {count === 1 ? 'One word' : `${count} words`} didn&apos;t sound quite right earlier. One more go at each — no
        pressure.
      </Text>
      <Button themed label="Start" onPress={onStart} style={styles.button} />
      <Button themed label="Skip for now" variant="ghost" onPress={onSkip} style={styles.button} />
    </Reveal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emoji: { fontSize: 56, marginBottom: spacing.sm },
    title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    body: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: spacing.lg },
    button: { alignSelf: 'stretch' },
  });
