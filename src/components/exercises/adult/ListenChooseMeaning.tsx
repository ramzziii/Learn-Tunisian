import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { TunisianText } from '@/components/tunisian/TunisianText';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { exerciseSizing, radii, spacing, type ThemeColors } from '@/constants/theme';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { isListeningAnswerCorrect } from '@/lib/listening';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { ExerciseItem } from '@/types/exercises';

interface ListenChooseMeaningProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/**
 * Listening quiz: hear a native recording, choose what it means. The
 * recording plays by itself and can be replayed; it is never swapped for
 * the device voice (fallbackVoice: false) — if it can't load, the learner
 * gets a retry. A wrong choice replays the recording and reveals the word.
 */
export function ListenChooseMeaning({ exercise, onComplete }: ListenChooseMeaningProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const audio = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true, fallbackVoice: false });
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  const [chosenGroupId, setChosenGroupId] = useState<string | null>(null);
  const reported = useRef(false);

  const isCorrect = chosenGroupId !== null && isListeningAnswerCorrect(exercise, chosenGroupId);

  const choose = (groupId: string) => {
    if (chosenGroupId) return;
    setChosenGroupId(groupId);
    if (isListeningAnswerCorrect(exercise, groupId)) {
      playCorrect();
    } else {
      playIncorrect();
      audio.play();
    }
  };

  const finish = () => {
    if (reported.current) return;
    reported.current = true;
    onComplete(isCorrect);
  };

  return (
    <View style={styles.container}>
      <AudioPlayButton
        onPress={audio.play}
        hasAudio={audio.hasAudio}
        isResolving={audio.isResolving}
        hasError={audio.hasError}
        onRetry={audio.retry}
        style={{ marginTop: spacing.lg }}
      />
      {audio.hasError ? (
        <Text style={styles.unavailable}>Couldn’t load this recording. Check your connection, then tap ↻ to retry.</Text>
      ) : null}
      <Text style={styles.instructions}>What does this mean?</Text>

      {/* AnswerFeedback reveals the word after a miss; this shows it after a hit. */}
      {chosenGroupId && isCorrect ? (
        <TunisianText
          arabic={exercise.promptVariant.wordArabic}
          latin={exercise.promptVariant.transliteration}
          size="lg"
          arabicStyle={styles.arabic}
          latinStyle={styles.transliteration}
          style={styles.reveal}
        />
      ) : null}

      <View style={styles.list}>
        {exercise.options.map((option, index) => {
          const answered = chosenGroupId !== null;
          const isTheAnswer = option.group.id === exercise.targetGroup.id;
          const isChosenWrong = answered && option.group.id === chosenGroupId && !isTheAnswer;
          return (
            <Reveal key={option.group.id} delay={index * 60}>
              <PressableScale
                scaleTo={0.98}
                onPress={() => choose(option.group.id)}
                disabled={answered}
                accessibilityRole="button"
                accessibilityLabel={`Choose “${option.group.englishMeaning}”`}
                accessibilityState={{ disabled: answered }}
                style={[
                  styles.option,
                  answered && isTheAnswer && styles.optionCorrect,
                  isChosenWrong && styles.optionIncorrect,
                ]}
              >
                <Text style={styles.optionText}>{option.group.englishMeaning}</Text>
                {answered && isTheAnswer ? <Text style={styles.statusCorrect}>✓ Right answer</Text> : null}
                {isChosenWrong ? <Text style={styles.statusIncorrect}>✗ Your choice</Text> : null}
              </PressableScale>
            </Reveal>
          );
        })}
      </View>

      {chosenGroupId ? (
        <AnswerFeedback
          isCorrect={isCorrect}
          correctWordArabic={exercise.promptVariant.wordArabic}
          correctTransliteration={exercise.promptVariant.transliteration}
          correctMeaning={exercise.targetGroup.englishMeaning}
          onNext={finish}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center' },
    instructions: {
      fontSize: exerciseSizing.bodyFontSize,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    unavailable: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
    reveal: { alignItems: 'center', marginBottom: spacing.sm },
    arabic: { fontSize: 26, color: colors.textPrimary, writingDirection: 'rtl' },
    transliteration: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
    list: { width: '100%', gap: spacing.sm },
    option: {
      minHeight: 56,
      justifyContent: 'center',
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionCorrect: { borderColor: colors.success, backgroundColor: `${colors.success}1F` },
    optionIncorrect: { borderColor: colors.error, backgroundColor: `${colors.error}1F` },
    optionText: { fontSize: exerciseSizing.bodyFontSize, fontWeight: '600', color: colors.textPrimary },
    statusCorrect: { fontSize: 14, fontWeight: '700', color: colors.success, marginTop: 4 },
    statusIncorrect: { fontSize: 14, fontWeight: '700', color: colors.error, marginTop: 4 },
  });
