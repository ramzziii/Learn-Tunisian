import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { VariantCallout } from '@/components/exercises/shared/VariantCallout';
import { AudioPlayButton } from '@/components/ui/AudioPlayButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { adultTrackSizing, colors, radii, spacing } from '@/constants/theme';
import { useAnswerFeedback } from '@/hooks/useAnswerFeedback';
import { useShake } from '@/hooks/useShake';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import { isAnyVariantTransliterationMatch } from '@/lib/wordVariants';
import type { ExerciseItem } from '@/types/exercises';

const CORRECT_FEEDBACK_DELAY_MS = 900;
const INCORRECT_FEEDBACK_DELAY_MS = 1800; // a little longer so there's time to read/hear the replay

interface TypingSpellingProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Adult/teen track: hear a word and its meaning, type its transliteration. Any variant of the concept counts as correct. */
export function TypingSpelling({ exercise, onComplete }: TypingSpellingProps) {
  const { play, hasAudio, isResolving, hasError, retry } = useWordAudioPlayer(exercise.promptVariant, { autoPlay: true });
  const { playCorrect, playIncorrect } = useAnswerFeedback();
  const { shake, shakeStyle } = useShake();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = isAnyVariantTransliterationMatch(exercise.targetGroup, input);

  const submit = () => {
    setSubmitted(true);
    if (isCorrect) {
      playCorrect();
    } else {
      playIncorrect();
      shake();
    }
  };

  useEffect(() => {
    if (!submitted) return;
    const delay = isCorrect ? CORRECT_FEEDBACK_DELAY_MS : INCORRECT_FEEDBACK_DELAY_MS;
    const timer = setTimeout(() => onComplete(isCorrect), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  return (
    <View style={styles.container}>
      <AudioPlayButton
        onPress={play}
        hasAudio={hasAudio}
        isResolving={isResolving}
        hasError={hasError}
        onRetry={retry}
        style={{ marginTop: spacing.lg }}
      />
      <Text style={styles.meaning}>&ldquo;{exercise.targetGroup.englishMeaning}&rdquo;</Text>
      <Text style={styles.instructions}>Type what you hear</Text>
      <VariantCallout group={exercise.targetGroup} />

      <Animated.View style={[{ width: '100%' }, submitted && !isCorrect ? shakeStyle : undefined]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!submitted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Type the transliteration"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, submitted && (isCorrect ? styles.inputCorrect : styles.inputIncorrect)]}
          onSubmitEditing={() => input.trim().length > 0 && submit()}
        />
      </Animated.View>

      <PressableScale
        haptic
        onPress={submit}
        disabled={submitted || input.trim().length === 0}
        style={[styles.submitButton, (submitted || input.trim().length === 0) && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitLabel}>Check</Text>
      </PressableScale>

      {submitted ? (
        <AnswerFeedback
          isCorrect={isCorrect}
          correctWordArabic={exercise.promptVariant.wordArabic}
          correctTransliteration={exercise.promptVariant.transliteration}
          correctMeaning={exercise.targetGroup.englishMeaning}
          onListenAgain={play}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  meaning: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  instructions: {
    fontSize: adultTrackSizing.bodyFontSize,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  input: {
    width: '100%',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 18,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
  inputCorrect: { borderColor: colors.success, backgroundColor: '#E3F5EA' },
  inputIncorrect: { borderColor: colors.error, backgroundColor: '#FBEAE6' },
  submitButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
