import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { adultTrackSizing, colors, radii, spacing } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

const FEEDBACK_DELAY_MS = 900;

interface ReadingMatchProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Adult/teen track: listen to a word, tap the matching written Arabic script. */
export function ReadingMatch({ exercise, onComplete }: ReadingMatchProps) {
  const { play, hasAudio } = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGroupId) return;
    const timer = setTimeout(() => onComplete(selectedGroupId === exercise.targetGroup.id), FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [selectedGroupId, exercise.targetGroup.id, onComplete]);

  const isCorrectSelection = selectedGroupId === exercise.targetGroup.id;

  return (
    <View style={styles.container}>
      <Pressable onPress={play} disabled={!hasAudio} style={[styles.playButton, !hasAudio && styles.playButtonDisabled]}>
        <Text style={styles.playIcon}>🔊</Text>
      </Pressable>
      <Text style={styles.instructions}>Tap the word you hear</Text>
      <VariantCallout group={exercise.targetGroup} />

      <View style={styles.list}>
        {exercise.options.map((option) => {
          const isSelected = selectedGroupId === option.group.id;
          const revealCorrect = selectedGroupId !== null && option.group.id === exercise.targetGroup.id;
          return (
            <Pressable
              key={option.group.id}
              onPress={() => !selectedGroupId && setSelectedGroupId(option.group.id)}
              disabled={!!selectedGroupId}
              style={[
                styles.option,
                isSelected && (isCorrectSelection ? styles.optionCorrect : styles.optionIncorrect),
                revealCorrect && !isSelected && styles.optionCorrect,
              ]}
            >
              <Text style={styles.arabicScript}>{option.variant.wordArabic}</Text>
              <Text style={styles.transliteration}>{option.variant.transliteration}</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedGroupId ? (
        <AnswerFeedback isCorrect={isCorrectSelection} correctAnswerLabel={exercise.targetGroup.englishMeaning} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  playButtonDisabled: { opacity: 0.4 },
  playIcon: { fontSize: 28 },
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
