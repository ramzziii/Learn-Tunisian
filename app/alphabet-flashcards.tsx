import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { buildAlphabetSet } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

const letters = buildAlphabetSet();

export default function AlphabetFlashcardsScreen() {
  const [index, setIndex] = useState(0);
  const { speak, isSpeaking } = useLetterSpeech();

  const letter = letters[index];
  const example = letter.examples[0];

  const goNext = () => setIndex((prev) => (prev + 1) % letters.length);

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <ProgressBar progress={(index + 1) / letters.length} />
        </View>
      </View>

      <PressableScale onPress={() => speak(letter.label)} style={[styles.card, shadows.card]}>
        <Text style={styles.bigLetter}>{letter.label}</Text>
        <Text style={styles.name}>{letter.name}</Text>
        <View style={[styles.playBadge, isSpeaking && styles.playBadgeActive]}>
          <Text style={styles.playIcon}>{isSpeaking ? '🔊' : '▶ Tap to hear it'}</Text>
        </View>
      </PressableScale>

      <PressableScale onPress={() => speak(example.arabic)} style={styles.exampleRow}>
        <Text style={styles.exampleArabic}>{example.arabic}</Text>
        <Text style={styles.exampleMeta}>
          {example.transliteration} · {example.english}
        </Text>
      </PressableScale>

      <PressableScale onPress={goNext} style={styles.nextButton}>
        <Text style={styles.nextText}>Next letter ›</Text>
      </PressableScale>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F5F2', paddingHorizontal: spacing.lg },
  topbar: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 26, color: colors.textPrimary },
  progressTrack: { flex: 1, marginLeft: spacing.md },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  bigLetter: { fontSize: 96, color: colors.textPrimary },
  name: { fontSize: 20, color: colors.textSecondary, marginTop: spacing.sm },
  playBadge: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  },
  playBadgeActive: { backgroundColor: '#FDF3E4' },
  playIcon: { fontSize: 14, fontWeight: '600', color: colors.primaryDark },
  exampleRow: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  exampleArabic: { fontSize: 26, color: colors.textPrimary },
  exampleMeta: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  nextButton: { marginTop: spacing.xl, alignSelf: 'center', padding: spacing.sm },
  nextText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
