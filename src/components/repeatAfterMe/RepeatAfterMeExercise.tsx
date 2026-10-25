import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PronunciationPractice, type PronunciationResult } from '@/components/pronunciation/PronunciationPractice';
import { spacing, type ThemeColors } from '@/constants/theme';
import type { RepeatAfterMeItem } from '@/data/repeatAfterMe';
import { useTheme } from '@/lib/theme/ThemeContext';

interface RepeatAfterMeExerciseProps {
  item: RepeatAfterMeItem;
  maxAttempts: number;
  /** The end-of-session single extra try. */
  isReview: boolean;
  onFinish: (result: PronunciationResult) => void;
}

/**
 * One Repeat After Me item: the shared record → check → compare flow
 * (src/components/pronunciation/PronunciationPractice.tsx) against the
 * admin's own recording — never the generated voice. The session decides
 * what a finished item means (src/lib/repeatAfterMe/session.ts).
 */
export function RepeatAfterMeExercise({ item, maxAttempts, isReview, onFinish }: RepeatAfterMeExerciseProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {isReview ? <Text style={styles.reviewLabel}>Review — one more try</Text> : null}
      <PronunciationPractice
        nativeVariant={item.variant}
        matchGroup={{ id: item.wordGroupId, variants: [item.variant] }}
        maxAttempts={maxAttempts}
        allowFallbackVoice={false}
        outOfTriesMessage={isReview ? 'Good effort — it’ll come up again next session.' : undefined}
        onFinish={onFinish}
      >
        <Text style={styles.meaning}>{item.englishMeaning}</Text>
        <Text style={styles.transliteration}>{item.variant.transliteration}</Text>
      </PronunciationPractice>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', gap: spacing.sm },
    reviewLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
    meaning: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
    transliteration: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  });
