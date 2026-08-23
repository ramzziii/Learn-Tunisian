import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnswerFeedback } from '@/components/exercises/shared/AnswerFeedback';
import { adultTrackSizing, colors, radii, spacing } from '@/constants/theme';
import { useWordAudioPlayer } from '@/hooks/useWordAudioPlayer';
import type { ExerciseItem } from '@/types/exercises';

const FEEDBACK_DELAY_MS = 1400;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

interface TypingSpellingProps {
  exercise: ExerciseItem;
  onComplete: (wasCorrect: boolean) => void;
}

/** Adult/teen track: hear a word and its meaning, type its transliteration. */
export function TypingSpelling({ exercise, onComplete }: TypingSpellingProps) {
  const { play, hasAudio } = useWordAudioPlayer(exercise.targetWord, { autoPlay: true });
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isCorrect = normalize(input) === normalize(exercise.targetWord.transliteration);

  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(() => onComplete(isCorrect), FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  return (
    <View style={styles.container}>
      <Pressable onPress={play} disabled={!hasAudio} style={[styles.playButton, !hasAudio && styles.playButtonDisabled]}>
        <Text style={styles.playIcon}>🔊</Text>
      </Pressable>
      <Text style={styles.meaning}>&ldquo;{exercise.targetWord.englishMeaning}&rdquo;</Text>
      <Text style={styles.instructions}>Type what you hear</Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        editable={!submitted}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Type the transliteration"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, submitted && (isCorrect ? styles.inputCorrect : styles.inputIncorrect)]}
        onSubmitEditing={() => input.trim().length > 0 && setSubmitted(true)}
      />

      <Pressable
        onPress={() => setSubmitted(true)}
        disabled={submitted || input.trim().length === 0}
        style={[styles.submitButton, (submitted || input.trim().length === 0) && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitLabel}>Check</Text>
      </Pressable>

      {submitted ? (
        <AnswerFeedback isCorrect={isCorrect} correctAnswerLabel={exercise.targetWord.transliteration} />
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
  meaning: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.md },
  instructions: {
    fontSize: adultTrackSizing.bodyFontSize,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
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
