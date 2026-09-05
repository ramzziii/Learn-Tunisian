import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AlphabetAudioPrompt } from '@/components/alphabet/AlphabetAudioPrompt';
import { AlphabetExerciseFooter } from '@/components/alphabet/AlphabetExerciseFooter';
import { AnimatedAnswerCard, type AnswerCardState } from '@/components/alphabet/AnimatedAnswerCard';
import { colors, radii, spacing } from '@/constants/theme';
import { buildTrueFalseQuestion, getLetterById } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface AlphabetTrueFalseExerciseProps {
  letterId: string;
  onComplete: (correct: boolean) => void;
}

/** "Listen and choose" — hear a letter's sound, then say whether the letter shown on screen is the one that was spoken. */
export function AlphabetTrueFalseExercise({ letterId, onComplete }: AlphabetTrueFalseExerciseProps) {
  const [question] = useState(() => buildTrueFalseQuestion(letterId));
  const [selected, setSelected] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const { speak, isSpeaking } = useLetterSpeech();

  const audioLetter = getLetterById(question.audioLetterId)!;
  const shownLetter = getLetterById(question.shownLetterId)!;

  useEffect(() => {
    speak(audioLetter.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCorrect = selected === question.isMatch;

  return (
    <View style={styles.container}>
      <AlphabetAudioPrompt label="Listen and choose" onPress={() => speak(audioLetter.label)} isSpeaking={isSpeaking} />

      <Text style={styles.currentLetter}>{shownLetter.label}</Text>

      <View style={styles.optionList}>
        {[false, true].map((value) => {
          const isSelected = selected === value;
          const isAnswer = checked && value === question.isMatch;
          const isWrongSelected = checked && isSelected && value !== question.isMatch;
          const state: AnswerCardState = isAnswer ? 'correct' : isWrongSelected ? 'wrong' : isSelected ? 'selected' : 'idle';
          return (
            <AnimatedAnswerCard
              key={String(value)}
              state={state}
              onPress={() => !checked && setSelected(value)}
              disabled={checked}
              style={[
                styles.option,
                isSelected && !checked && styles.optionSelected,
                isAnswer && styles.optionCorrect,
                isWrongSelected && styles.optionWrong,
              ]}
            >
              <Text style={styles.optionText}>{value ? 'True' : 'False'}</Text>
            </AnimatedAnswerCard>
          );
        })}
      </View>

      <AlphabetExerciseFooter
        checked={checked}
        isCorrect={isCorrect}
        correctAnswerLabel={audioLetter.label}
        canCheck={selected !== null}
        onCheck={() => setChecked(true)}
        onNext={() => onComplete(isCorrect)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  currentLetter: { fontSize: 90, color: colors.textPrimary, textAlign: 'center', marginVertical: spacing.lg },
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
  optionText: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
});
