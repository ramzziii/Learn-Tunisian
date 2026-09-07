import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { adultTrackSizing, colors, radii, spacing } from '@/constants/theme';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { useShake } from '@/hooks/useShake';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

const CORRECT_FEEDBACK_DELAY_MS = 900;
const INCORRECT_FEEDBACK_DELAY_MS = 1800; // a little longer so there's time to read/hear the replay

interface ReadingMatchProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Adult/teen track: listen to a word, tap the matching written Arabic script. */
export function ReadingMatch({ exercise, onComplete }: ReadingMatchProps) {
  const { play, hasAudio, isResolving, hasError, retry } = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true });
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  const { shake, shakeStyle } = useShake();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const isCorrectSelection = selectedGroupId === exercise.targetGroup.id;

  const selectOption = (groupId: string) => {
    if (selectedGroupId) return;
    setSelectedGroupId(groupId);
    if (groupId === exercise.targetGroup.id) {
      playCorrect();
    } else {
      playIncorrect();
      shake();
    }
  };

  useEffect(() => {
    if (!selectedGroupId) return;
    const delay = isCorrectSelection ? CORRECT_FEEDBACK_DELAY_MS : INCORRECT_FEEDBACK_DELAY_MS;
    const timer = setTimeout(() => onComplete(isCorrectSelection), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  return (
    <View style={styles.container}>
      <AudioPlayButton
        onPress={play}
        hasAudio={hasAudio}
        isResolving={isResolving}
        hasError={hasError}
        onRetry={retry}
        style={{ marginTop: spacing.lg }}
      />
      <Text style={styles.instructions}>Tap the word you hear</Text>
      <VariantCallout group={exercise.targetGroup} />

      <View style={styles.list}>
        {exercise.options.map((option, index) => {
          const isSelected = selectedGroupId === option.group.id;
          const revealCorrect = selectedGroupId !== null && option.group.id === exercise.targetGroup.id;
          return (
            <Reveal key={option.group.id} delay={index * 60}>
              <Animated.View style={isSelected && !isCorrectSelection ? shakeStyle : undefined}>
                <PressableScale
                  scaleTo={0.98}
                  onPress={() => selectOption(option.group.id)}
                  disabled={!!selectedGroupId}
                  style={[
                    styles.option,
                    isSelected && (isCorrectSelection ? styles.optionCorrect : styles.optionIncorrect),
                    revealCorrect && !isSelected && styles.optionCorrect,
                  ]}
                >
                  <Text style={styles.arabicScript}>{option.variant.wordArabic}</Text>
                  <Text style={styles.transliteration}>{option.variant.transliteration}</Text>
                </PressableScale>
              </Animated.View>
            </Reveal>
          );
        })}
      </View>

      {selectedGroupId ? (
        <AnswerFeedback
          isCorrect={isCorrectSelection}
          correctWordArabic={exercise.promptVariant.wordArabic}
          correctTransliteration={exercise.promptVariant.transliteration}
          correctMeaning={exercise.targetGroup.englishMeaning}
          onListenAgain={play}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  instructions: {
    fontSize: adultTrackSizing.bodyFontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  list: { width: '100%', gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionCorrect: { borderColor: colors.success, backgroundColor: '#E3F5EA' },
  optionIncorrect: { borderColor: colors.error, backgroundColor: '#FBEAE6' },
  arabicScript: { fontSize: 24, color: colors.textPrimary },
  transliteration: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
});
