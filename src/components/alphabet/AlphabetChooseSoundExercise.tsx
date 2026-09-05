import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlphabetExerciseFooter } from '@/components/alphabet/AlphabetExerciseFooter';
import { AnimatedAnswerCard, type AnswerCardState } from '@/components/alphabet/AnimatedAnswerCard';
import { colors, radii, spacing } from '@/constants/theme';
import { buildAlphabetChoices, getLetterById } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface AlphabetChooseSoundExerciseProps {
  letterId: string;
  onComplete: (correct: boolean) => void;
}

/** "Choose the sound of the letter" — a letter is shown, tap each speaker option to preview it and pick the one that matches. */
export function AlphabetChooseSoundExercise({ letterId, onComplete }: AlphabetChooseSoundExerciseProps) {
  const [choices] = useState(() => buildAlphabetChoices(letterId, 4));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const { speak, isSpeaking } = useLetterSpeech();

  const targetLetter = getLetterById(letterId)!;
  const isCorrect = selectedId === letterId;

  return (
    <View style={styles.container}>
      <Text style={styles.prompt}>Choose the sound of the letter</Text>
      <Text style={styles.currentLetter}>{targetLetter.label}</Text>

      <View style={styles.optionList}>
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
              onPress={() => {
                if (checked) return;
                setSelectedId(choiceId);
                speak(choice.label);
              }}
              disabled={checked}
              style={[
                styles.option,
                isSelected && !checked && styles.optionSelected,
                isAnswer && styles.optionCorrect,
                isWrongSelected && styles.optionWrong,
              ]}
            >
              <Text style={styles.optionIcon}>{isSpeaking && isSelected ? '🔊' : '🔈'}</Text>
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
  prompt: { fontSize: 18, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  currentLetter: { fontSize: 80, textAlign: 'center', color: colors.textPrimary, marginVertical: spacing.md },
  optionList: { gap: spacing.sm, marginBottom: spacing.lg },
  option: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: '#FDF3E4' },
  optionCorrect: { borderColor: '#4FBF76', backgroundColor: '#DFF4E7' },
  optionWrong: { borderColor: '#E76B60', backgroundColor: '#F9E0DD' },
  optionIcon: { fontSize: 22 },
});
