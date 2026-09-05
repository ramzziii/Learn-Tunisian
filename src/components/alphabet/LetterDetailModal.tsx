import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import type { ArabicLetter } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface LetterDetailModalProps {
  letter: ArabicLetter | null;
  onClose: () => void;
}

export function LetterDetailModal({ letter, onClose }: LetterDetailModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const isVisible = letter !== null;

  useEffect(() => {
    // The Modal component only animates its own content (via `animationType`)
    // — the backdrop we render ourselves needs its own fade to avoid popping
    // in instantly behind the sliding sheet.
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {letter ? (
          <View style={[styles.sheet, shadows.raised]}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.bigLetter}>{letter.label}</Text>
              <Text style={styles.letterName}>{letter.name}</Text>

              <PressableScale
                onPress={() => speak(letter.label)}
                style={[styles.playButton, isSpeaking && styles.playButtonActive]}
              >
                <Text style={styles.playIcon}>{isSpeaking ? '🔊' : '▶'}</Text>
              </PressableScale>

              <Text style={styles.sectionLabel}>Letter Forms</Text>
              <View style={styles.formsRow}>
                <FormBox label="Isolated" value={letter.forms.isolated} />
                <FormBox label="Initial" value={letter.forms.initial} />
                <FormBox label="Medial" value={letter.forms.medial} />
                <FormBox label="Final" value={letter.forms.final} />
              </View>

              <Text style={styles.sectionLabel}>Examples</Text>
              {letter.examples.map((example) => (
                <View key={example.arabic} style={styles.exampleRow}>
                  <View style={styles.exampleText}>
                    <Text style={styles.exampleArabic}>{example.arabic}</Text>
                    <Text style={styles.exampleTransliteration}>
                      {example.transliteration} · {example.english}
                    </Text>
                  </View>
                  <PressableScale onPress={() => speak(example.arabic)} style={styles.exampleAudioButton}>
                    <Text style={styles.exampleAudioIcon}>🔊</Text>
                  </PressableScale>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

function FormBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.formBox}>
      <Text style={styles.formValue}>{value}</Text>
      <Text style={styles.formLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(36, 32, 33, 0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 18, color: colors.textPrimary },
  bigLetter: { fontSize: 72, textAlign: 'center', color: colors.textPrimary, marginTop: spacing.sm },
  letterName: { fontSize: 18, textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xs },
  playButton: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  playButtonActive: { backgroundColor: colors.primaryDark },
  playIcon: { fontSize: 22, color: colors.textOnPrimary },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  formsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.lg },
  formBox: {
    flex: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  formValue: { fontSize: 22, color: colors.textPrimary },
  formLabel: { fontSize: 10, color: colors.textSecondary, marginTop: spacing.xs },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exampleText: { flex: 1 },
  exampleArabic: { fontSize: 20, color: colors.textPrimary },
  exampleTransliteration: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  exampleAudioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleAudioIcon: { fontSize: 16 },
});
