import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { splitAtLetter, type ArabicLetter, type LetterPosition } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface LetterDetailModalProps {
  letter: ArabicLetter | null;
  onClose: () => void;
}

const FORM_LABELS = ['Final', 'Medial', 'Initial', 'Isolated'] as const;

export function LetterDetailModal({ letter, onClose }: LetterDetailModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const isVisible = letter !== null;

  useEffect(() => {
    // The Modal component only animates its own content (via `animationType`)
    // — the backdrop we render ourselves needs its own fade to avoid popping
    // in instantly behind the sliding sheet.
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

  useEffect(() => {
    if (!isVisible) return;
    contentAnim.setValue(0);
    Animated.spring(contentAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [letter?.id, isVisible, contentAnim]);

  useEffect(() => {
    if (!isSpeaking) setActiveKey(null);
  }, [isSpeaking]);

  const play = (key: string, text: string) => {
    Haptics.selectionAsync();
    setActiveKey(key);
    speak(text);
  };

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
              <Animated.View
                style={{
                  opacity: contentAnim,
                  transform: [{ scale: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                }}
              >
                <Text style={styles.bigLetter}>{letter.label}</Text>
                <Text style={styles.letterName}>{letter.name}</Text>

                <PressableScale
                  onPress={() => play('letter', letter.label)}
                  style={[styles.playButton, activeKey === 'letter' && styles.playButtonActive]}
                >
                  <Text style={styles.playIcon}>{activeKey === 'letter' ? '🔊' : '▶'}</Text>
                </PressableScale>
              </Animated.View>

              <Text style={styles.sectionLabel}>Letter Forms</Text>
              <View style={styles.formsRow}>
                {FORM_LABELS.map((label) => {
                  const value = letter.forms[label.toLowerCase() as 'isolated' | 'initial' | 'medial' | 'final'];
                  return <FormBox key={label} label={label} value={value} />;
                })}
              </View>

              <Text style={styles.sectionLabel}>Examples</Text>
              {FORM_LABELS.map((label) => {
                const position = label.toLowerCase() as LetterPosition;
                const example = letter.positionExamples[position];
                // null for the 6 non-connecting letters' initial/medial slots
                // — they only ever connect from the letter before them, never
                // to the one after, so those two shapes don't occur in real
                // Arabic and there's no example to fabricate.
                if (!example) return null;

                const key = `example-${position}`;
                const isActive = activeKey === key;
                const highlighted = splitAtLetter(example.arabic, letter);
                return (
                  <View key={position}>
                    <Text style={styles.examplePositionLabel}>{label}</Text>
                    <PressableScale
                      onPress={() => play(key, example.arabic)}
                      style={[styles.exampleRow, isActive && styles.exampleRowActive]}
                    >
                      <View style={styles.exampleEmojiBox}>
                        <Text style={styles.exampleEmoji}>{example.emoji ?? '🔤'}</Text>
                      </View>
                      <View style={styles.exampleText}>
                        <Text style={styles.exampleArabic}>
                          {highlighted ? (
                            <>
                              {highlighted.before}
                              <Text style={styles.exampleArabicHighlight}>{highlighted.match}</Text>
                              {highlighted.after}
                            </>
                          ) : (
                            example.arabic
                          )}
                        </Text>
                        <Text style={styles.exampleTransliteration}>
                          {example.transliteration} · {example.english}
                        </Text>
                      </View>
                      <Text style={styles.exampleAudioIcon}>{isActive ? '🔊' : '🔈'}</Text>
                    </PressableScale>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

function FormBox({ label, value }: { label: string; value: string }) {
  // A plain View, not PressableScale — these are informational only (no tap,
  // no sound), so no press feedback or active-state styling applies here.
  return (
    <View style={styles.formBoxWrapper}>
      <View style={styles.formBox}>
        <Text style={styles.formValue}>{value}</Text>
        <Text style={styles.formLabel}>{label}</Text>
      </View>
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
    ...shadows.card,
  },
  playButtonActive: { backgroundColor: colors.primaryDark },
  playIcon: { fontSize: 22, color: colors.textOnPrimary },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  formsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  formBoxWrapper: { flex: 1 },
  formBox: {
    borderRadius: radii.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  formValue: { fontSize: 26, color: colors.textPrimary },
  formLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.xs },
  examplePositionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  exampleRowActive: { borderColor: colors.primary },
  exampleEmojiBox: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  exampleEmoji: { fontSize: 20 },
  exampleText: { flex: 1 },
  exampleArabic: { fontSize: 20, color: colors.textPrimary },
  // No bold weight — a heavier weight renders visibly larger for this Arabic
  // glyph shape even at an identical fontSize, which reads as "bigger" rather
  // than just "different color" (same fix as the Flashcards screen).
  exampleArabicHighlight: { fontSize: 20, color: colors.error, fontWeight: '400' },
  exampleTransliteration: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  exampleAudioIcon: { fontSize: 16 },
});
