import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlphabetExerciseFooter } from '@/components/alphabet/AlphabetExerciseFooter';
import { AnimatedAnswerCard, type AnswerCardState } from '@/components/alphabet/AnimatedAnswerCard';
import { colors, radii, spacing } from '@/constants/theme';
import { buildSimilarLetterChoices, getLetterById, withFatha } from '@/lib/alphabet';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const GRID_COLUMNS = 2;

interface AlphabetSoundMatchExerciseProps {
  letterId: string;
  onComplete: (correct: boolean) => void;
}

/**
 * "Choose the letter which is similar to ( Ba ) as in ( Bank )" — a
 * text-only exercise with no audio: the learner matches an English
 * phonetic cue to the Arabic letter (vocalized with a fatha) that makes
 * that sound. Distractors are drawn from letters that share the same base
 * glyph shape, so it doubles as a visual-discrimination drill.
 */
export function AlphabetSoundMatchExercise({ letterId, onComplete }: AlphabetSoundMatchExerciseProps) {
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.md);
  const [choices] = useState(() => buildSimilarLetterChoices(letterId, 4));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const targetLetter = getLetterById(letterId)!;
  const isCorrect = selectedId === letterId;

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>
        Choose the letter which is similar to ( {targetLetter.phoneticCue.sound} ) as in ( {targetLetter.phoneticCue.exampleWord} )
      </Text>

      <View style={styles.grid}>
        {choices.map((choiceId) => {
          const choice = getLetterById(choiceId)!;
          const isSelected = selectedId === choiceId;
          const isAnswer = checked && choiceId === letterId;
          const isWrongSelected = checked && isSelected && choiceId !== letterId;
          const state: AnswerCardState = isAnswer ? 'correct' : isWrongSelected ? 'wrong' : isSelected ? 'selected' : 'idle';

          return (
            <AnimatedAnswerCard
              key={choiceId}
              state={state}
              onPress={() => !checked && setSelectedId(choiceId)}
              disabled={checked}
              style={[
                styles.card,
                { width: cardWidth },
                isSelected && !checked && styles.cardSelected,
                isAnswer && styles.cardCorrect,
                isWrongSelected && styles.cardWrong,
              ]}
            >
              <Text style={styles.cardText}>{withFatha(choice)}</Text>
            </AnimatedAnswerCard>
          );
        })}
      </View>

      <AlphabetExerciseFooter
        checked={checked}
        isCorrect={isCorrect}
        correctAnswerLabel={withFatha(targetLetter)}
        canCheck={selectedId !== null}
        onCheck={() => setChecked(true)}
        onNext={() => onComplete(isCorrect)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  prompt: {
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    minHeight: 140,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: '#FDF3E4' },
  cardCorrect: { borderColor: '#4FBF76', backgroundColor: '#DFF4E7' },
  cardWrong: { borderColor: '#E76B60', backgroundColor: '#F9E0DD' },
  cardText: { fontSize: 54, color: colors.textPrimary },
});
