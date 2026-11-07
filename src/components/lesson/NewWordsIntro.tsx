import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormDisplay } from '@/components/tunisian/FormDisplay';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { WordGroupWithVariants } from '@/types/models';

interface NewWordsIntroProps {
  /** The lesson's words this learner hasn't practised yet, in lesson order. */
  groups: WordGroupWithVariants[];
  /** "Start practice" on the last card, or "Skip to practice". */
  onDone: () => void;
}

/**
 * Teach before testing: before a lesson's quiz, each word the learner hasn't
 * met yet gets one card — what it means, how it's written (both forms for a
 * two-form word), and its recording. FormDisplay keeps the audio rules: each
 * form plays only its own recording, a computer voice is labelled and plays
 * only on tap, and a form without a recording says so. Not timed; the
 * lesson's clock starts with the quiz.
 */
export function NewWordsIntro({ groups, onDone }: NewWordsIntroProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [index, setIndex] = useState(0);

  const group = groups[index];
  const isLast = index === groups.length - 1;
  if (!group) return null;

  return (
    <ScreenContainer themed>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={styles.close}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar themed progress={(index + 1) / groups.length} />
        </View>
      </View>

      <Text style={styles.eyebrow} accessibilityRole="header">
        New words · {index + 1} of {groups.length}
      </Text>

      <Reveal key={group.id} style={[styles.card, shadows.card]}>
        <Text style={styles.meaning}>{group.englishMeaning}</Text>
        <FormDisplay group={group} size="xl" arabicStyle={styles.arabic} latinStyle={styles.latin} />
      </Reveal>

      <View style={styles.actions}>
        <Button themed label={isLast ? 'Start practice' : 'Next'} onPress={() => (isLast ? onDone() : setIndex((i) => i + 1))} />
        {index > 0 ? <Button themed label="Back" variant="ghost" onPress={() => setIndex((i) => i - 1)} /> : null}
        {!isLast ? <Button themed label="Skip to practice" variant="ghost" onPress={onDone} /> : null}
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    close: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    closeIcon: { fontSize: 16, color: colors.textSecondary },
    eyebrow: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
    meaning: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
    arabic: { color: colors.textPrimary },
    latin: { color: colors.textSecondary },
    actions: { marginTop: 'auto', gap: spacing.xs },
  });
