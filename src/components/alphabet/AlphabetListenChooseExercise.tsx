import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlphabetAudioPrompt } from '@/components/alphabet/AlphabetAudioPrompt';
import { AlphabetExerciseFooter } from '@/components/alphabet/AlphabetExerciseFooter';
import { AnimatedAnswerCard, type AnswerCardState } from '@/components/alphabet/AnimatedAnswerCard';
import { colors, radii, spacing } from '@/constants/theme';
import { buildAlphabetChoices, getLetterById } from '@/lib/alphabet';
import { useColumnWidth } from '@/hooks/useColumnWidth';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

const GRID_COLUMNS = 2;

interface AlphabetListenChooseExerciseProps {
  letterId: string;
  onComplete: (correct: boolean) => void;
}

/** "Listen and choose" — hear a letter's sound, tap the matching letter card among 4. */
export function AlphabetListenChooseExercise({ letterId, onComplete }: AlphabetListenChooseExerciseProps) {
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.md);
  const [choices] = useState(() => buildAlphabetChoices(letterId, 4));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const { speak, isSpeaking } = useLetterSpeech();

  const targetLetter = getLetterById(letterId)!;

  useEffect(() => {
    speak(targetLetter.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCorrect = selectedId === letterId;

  return (
    <View style={styles.container}>
      <AlphabetAudioPrompt label="Listen and choose" onPress={() => speak(targetLetter.label)} isSpeaking={isSpeaking} />

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
              <Text style={styles.cardText}>{choice.label}</Text>
            </AnimatedAnswerCard>
          );
        })}
      </View>

      <AlphabetExerciseFooter
        checked={checked}
        isCorrect={isCorrect}
        correctAnswerLabel={targetLetter.label}
        canCheck={selectedId !== null}
        onCheck={() => setChecked(true)}
        onNext={() => onComplete(isCorrect)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
