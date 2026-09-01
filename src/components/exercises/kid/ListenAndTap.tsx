import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { WordPicture } from '@/components/exercises/shared/WordPicture';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { colors, kidTrackSizing, radii, spacing } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

const CORRECT_FEEDBACK_DELAY_MS = 900;
const INCORRECT_FEEDBACK_DELAY_MS = 1800; // a little longer so there's time to hear the replay
const PICTURE_SIZE = 120;

interface ListenAndTapProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Kid track: listen to a word, tap the matching picture. No reading required to answer. */
export function ListenAndTap({ exercise, onComplete }: ListenAndTapProps) {
  const { play, hasAudio, isResolving, hasError, retry } = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const isCorrectSelection = selectedGroupId === exercise.targetGroup.id;

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
        size={96}
        style={{ marginTop: spacing.lg }}
      />
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
        <AnswerFeedback
          isCorrect={isCorrectSelection}
          correctWordArabic={exercise.promptVariant.wordArabic}
          onListenAgain={play}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
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
