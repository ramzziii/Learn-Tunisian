import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { TunisianText } from '@/components/tunisian/TunisianText';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { exerciseSizing, radii, spacing, type ThemeColors } from '@/constants/theme';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { useClipPlayer } from '@/hooks/useClipPlayer';
import { isListeningAnswerCorrect } from '@/lib/listening';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { ExerciseItem } from '@/types/exercises';

interface ListenChooseRecordingProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/**
 * Listening quiz: see a meaning, choose the native recording that says it.
 * Each option has its own Play button (which only plays) and a separate
 * Choose button; one shared player means only one clip plays at a time.
 * The words stay hidden until the learner has answered. A wrong choice
 * plays the correct recording and reveals the word — no penalty beyond the
 * one right/wrong result reported to the session.
 */
export function ListenChooseRecording({ exercise, onComplete }: ListenChooseRecordingProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const clips = useClipPlayer();
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  const [chosenGroupId, setChosenGroupId] = useState<string | null>(null);
  const reported = useRef(false);

  const total = exercise.options.length;
  const correctIndex = exercise.options.findIndex((o) => o.group.id === exercise.targetGroup.id);
  const isCorrect = chosenGroupId !== null && isListeningAnswerCorrect(exercise, chosenGroupId);
  const clipKey = (index: number) => `${exercise.key}-option-${index}`;

  const choose = (groupId: string) => {
    if (chosenGroupId) return;
    setChosenGroupId(groupId);
    if (isListeningAnswerCorrect(exercise, groupId)) {
      playCorrect();
    } else {
      playIncorrect();
      // Hear the right one, so a miss teaches.
      clips.play(clipKey(correctIndex), exercise.options[correctIndex].variant);
    }
  };

  const finish = () => {
    if (reported.current) return;
    reported.current = true;
    onComplete(isCorrect);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.instructions}>Which recording means</Text>
      <Text style={styles.meaning}>&ldquo;{exercise.targetGroup.englishMeaning}&rdquo;</Text>
      <Text style={styles.hint}>Play each one, then choose.</Text>

      <View style={styles.list}>
        {exercise.options.map((option, index) => {
          const n = index + 1;
          const key = clipKey(index);
          const unavailable = clips.isUnavailable(key);
          const loading = clips.isLoading(key);
          const playing = clips.isPlaying(key);
          const answered = chosenGroupId !== null;
          const isTheAnswer = option.group.id === exercise.targetGroup.id;
          const isChosenWrong = answered && option.group.id === chosenGroupId && !isTheAnswer;
          return (
            <Reveal key={option.group.id} delay={index * 60}>
              <View
                style={[
                  styles.option,
                  answered && isTheAnswer && styles.optionCorrect,
                  isChosenWrong && styles.optionIncorrect,
                ]}
              >
                <View style={styles.row}>
                  <PressableScale
                    scaleTo={0.96}
                    onPress={() => clips.play(key, option.variant)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`${unavailable ? 'Retry' : 'Play'} recording ${n} of ${total}`}
                    accessibilityState={{ busy: loading }}
                    style={[styles.playButton, unavailable && styles.playButtonRetry]}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                      <Text style={styles.playIcon}>{unavailable ? '↻' : playing ? '🔊' : '▶'}</Text>
                    )}
                  </PressableScale>
                  <Text style={styles.optionLabel}>Recording {n}</Text>
                  <PressableScale
                    scaleTo={0.98}
                    onPress={() => choose(option.group.id)}
                    disabled={answered}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose recording ${n} of ${total}`}
                    accessibilityState={{ disabled: answered }}
                    style={[styles.chooseButton, answered && styles.chooseButtonDone]}
                  >
                    <Text style={styles.chooseLabel}>Choose</Text>
                  </PressableScale>
                </View>

                {unavailable ? (
                  <Text style={styles.unavailable}>
                    Couldn’t load this recording. Check your connection, then tap ↻ to retry.
                  </Text>
                ) : null}

                {answered ? (
                  <View style={styles.reveal}>
                    <TunisianText
                      arabic={option.variant.wordArabic}
                      latin={option.variant.transliteration}
                      layout="inline"
                      arabicStyle={styles.arabic}
                      latinStyle={styles.transliteration}
                    />
                    <Text style={styles.transliteration}>{option.group.englishMeaning}</Text>
                    {isTheAnswer ? <Text style={styles.statusCorrect}>✓ Right answer</Text> : null}
                    {isChosenWrong ? <Text style={styles.statusIncorrect}>✗ Your choice</Text> : null}
                  </View>
                ) : null}
              </View>
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
    instructions: { fontSize: exerciseSizing.bodyFontSize, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.lg },
    meaning: { fontSize: exerciseSizing.titleFontSize, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs, textAlign: 'center' },
    hint: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
    list: { width: '100%', gap: spacing.sm },
    option: {
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionCorrect: { borderColor: colors.success, backgroundColor: `${colors.success}1F` },
    optionIncorrect: { borderColor: colors.error, backgroundColor: `${colors.error}1F` },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    playButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    playButtonRetry: { backgroundColor: colors.accent },
    playIcon: { fontSize: 20, color: colors.textOnPrimary },
    optionLabel: { flex: 1, fontSize: exerciseSizing.bodyFontSize, fontWeight: '600', color: colors.textPrimary },
    chooseButton: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    chooseButtonDone: { opacity: 0.4 },
    chooseLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
    unavailable: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
    reveal: { marginTop: spacing.sm, gap: 2 },
    arabic: { fontSize: 22, color: colors.textPrimary, writingDirection: 'rtl', textAlign: 'left' },
    transliteration: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
    statusCorrect: { fontSize: 14, fontWeight: '700', color: colors.success, marginTop: 2 },
    statusIncorrect: { fontSize: 14, fontWeight: '700', color: colors.error, marginTop: 2 },
  });
