import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
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
  const { play, hasAudio } = useWordAudioPlayer(exercise.targetWord, { autoPlay: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => onComplete(selectedId === exercise.targetWord.id), FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [selectedId, exercise.targetWord.id, onComplete]);

  const isCorrectSelection = selectedId === exercise.targetWord.id;

  return (
    <View style={styles.container}>
      <Pressable onPress={play} disabled={!hasAudio} style={[styles.playButton, !hasAudio && styles.playButtonDisabled]}>
        <Text style={styles.playIcon}>🔊</Text>
      </Pressable>
      <Text style={styles.instructions}>Tap the word you hear</Text>

      <View style={styles.list}>
        {exercise.options.map((option) => {
          const isSelected = selectedId === option.id;
          const revealCorrect = selectedId !== null && option.id === exercise.targetWord.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => !selectedId && setSelectedId(option.id)}
              disabled={!!selectedId}
              style={[
                styles.option,
                isSelected && (isCorrectSelection ? styles.optionCorrect : styles.optionIncorrect),
                revealCorrect && !isSelected && styles.optionCorrect,
              ]}
            >
              <Text style={styles.arabicScript}>{option.arabicScript}</Text>
              <Text style={styles.transliteration}>{option.transliteration}</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedId ? (
        <AnswerFeedback isCorrect={isCorrectSelection} correctAnswerLabel={exercise.targetWord.englishMeaning} />
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
    marginBottom: spacing.xl,
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
