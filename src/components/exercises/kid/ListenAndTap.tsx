import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { WordPicture } from '@/components/exercises/shared/WordPicture';
import { colors, kidTrackSizing, radii, spacing } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

const FEEDBACK_DELAY_MS = 900;
const PICTURE_SIZE = 120;

interface ListenAndTapProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Kid track: listen to a word, tap the matching picture. No reading required to answer. */
export function ListenAndTap({ exercise, onComplete }: ListenAndTapProps) {
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
      <Pressable
        onPress={play}
        disabled={!hasAudio}
        style={[styles.playButton, !hasAudio && styles.playButtonDisabled]}
        accessibilityLabel="Play word"
      >
        <Text style={styles.playIcon}>🔊</Text>
      </Pressable>
      <Text style={styles.instructions}>Tap the matching picture</Text>
      <VariantCallout group={exercise.targetGroup} />

      <View style={styles.grid}>
        {exercise.options.map((option) => {
          const isSelected = selectedGroupId === option.group.id;
          const revealCorrect = selectedGroupId !== null && option.group.id === exercise.targetGroup.id;
          return (
            <Pressable
              key={option.group.id}
              onPress={() => !selectedGroupId && setSelectedGroupId(option.group.id)}
              disabled={!!selectedGroupId}
              style={[
                styles.card,
                isSelected && (isCorrectSelection ? styles.cardCorrect : styles.cardIncorrect),
                revealCorrect && !isSelected && styles.cardCorrect,
              ]}
            >
              <WordPicture group={option.group} size={PICTURE_SIZE} />
              <Text style={styles.arabicScript}>{option.variant.wordArabic}</Text>
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
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  playButtonDisabled: { opacity: 0.4 },
  playIcon: { fontSize: 36 },
  instructions: { fontSize: kidTrackSizing.bodyFontSize, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.lg },
  card: {
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cardCorrect: { borderColor: colors.success, backgroundColor: '#E3F5EA' },
  cardIncorrect: { borderColor: colors.error, backgroundColor: '#FBEAE6' },
  arabicScript: { fontSize: 22, marginTop: spacing.xs, color: colors.textPrimary },
});
