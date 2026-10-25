import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { PRONUNCIATION_MAX_ATTEMPTS, PronunciationPractice } from '@/components/pronunciation/PronunciationPractice';
import { adultTrackSizing, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { ExerciseCompleteHandler, ExerciseItem } from '@/types/exercises';

interface SpeakingPracticeProps {
  exercise: ExerciseItem;
  onComplete: ExerciseCompleteHandler;
}

/**
 * Adult/teen track: hear the word, record yourself, and see whether it
 * sounded right — the shared record → check → compare flow
 * (src/components/pronunciation/PronunciationPractice.tsx), checked against
 * any variant in the word group, like every other exercise type.
 *
 * Always reported as correct (spoken self-practice isn't a gate — a likely
 * recognition miss shouldn't cost mastery/spaced-repetition standing); a word
 * the learner moved on from without saying it right is flagged
 * `mispronounced`, so the session host revisits it at the end.
 */
export function SpeakingPractice({ exercise, onComplete }: SpeakingPracticeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <PronunciationPractice
        nativeVariant={exercise.promptVariant}
        matchGroup={exercise.targetGroup}
        maxAttempts={PRONUNCIATION_MAX_ATTEMPTS}
        allowFallbackVoice
        outOfTriesMessage={exercise.isRevisit ? 'Good effort — it’ll come up again in your reviews.' : undefined}
        onFinish={({ correct }) => (correct ? onComplete(true) : onComplete(true, { mispronounced: true }))}
      >
        <Text style={styles.instructions}>Listen, then record yourself saying it</Text>
        <VariantCallout group={exercise.targetGroup} />
      </PronunciationPractice>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center' },
    instructions: {
      fontSize: adultTrackSizing.bodyFontSize,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: spacing.md,
      textAlign: 'center',
    },
  });
