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
// Isolated is dropped from Examples (kept in Letter Forms above) — the other
// three positions already show the letter connected within a real word.
const EXAMPLE_LABELS = ['Final', 'Medial', 'Initial'] as const;

// Same three-accent palette as LetterDiacriticsModal's ACCENT_BY_DIACRITIC,
// so the two cards read as the same component family.
const ACCENT_BY_POSITION: Record<LetterPosition, string> = {
  final: colors.primary,
  medial: colors.accent,
  initial: colors.success,
  isolated: colors.primary,
};

// Matches LetterDiacriticsModal's CARD_ROW_HEIGHT so the glyph box and the
// example box line up — explicit height rather than flex-stretch, since
// PressableScale applies its style to an inner Animated.View, not the
// Pressable it renders, so a stretch on that style never reaches the row.
const CARD_ROW_HEIGHT = 84;

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
              {EXAMPLE_LABELS.map((label) => {
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
                const accent = ACCENT_BY_POSITION[position];
                return (
                  <View key={position} style={[styles.card, { borderLeftColor: accent }]}>
                    <View style={styles.formGlyphBox}>
                      <Text style={[styles.formGlyphText, { color: accent }]}>{letter.forms[position]}</Text>
                      <Text style={styles.formGlyphLabel}>{label}</Text>
                    </View>

                    {/* A plain View here (not another PressableScale) so flex:1 actually
                        expands within `card` — PressableScale applies the style it's given
                        to an inner Animated.View two levels below the Pressable it renders,
                        so a flex:1 passed to it never reaches the true flex child of the row. */}
                    <View style={styles.contentBlock}>
                      <PressableScale
                        onPress={() => play(key, example.arabic)}
                        style={[styles.exampleRow, isActive && { borderColor: accent }]}
                      >
                        <View style={styles.exampleEmojiBox}>
                          <Text style={styles.exampleEmoji}>{example.emoji ?? '🔤'}</Text>
                        </View>
                        <View style={styles.exampleText}>
                          <Text style={styles.exampleArabic} numberOfLines={1}>
                            {highlighted ? (
                              <>
                                {highlighted.before}
                                <Text style={[styles.exampleArabicHighlight, { color: accent }]}>
                                  {highlighted.match}
                                </Text>
                                {highlighted.after}
                              </>
                            ) : (
                              example.arabic
                            )}
                          </Text>
                          <Text style={styles.exampleTransliteration} numberOfLines={1}>
                            {example.transliteration} · {example.english}
                          </Text>
                        </View>
                        <Text style={styles.exampleAudioIcon}>{isActive ? '🔊' : '🔈'}</Text>
                      </PressableScale>
                    </View>
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
  // Mirrors LetterDiacriticsModal's card row exactly (same box sizes, gaps,
  // and font sizes as glyphButton/pictureRow) so the two modals' cards read
  // as the same component family.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    borderLeftWidth: 4,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  formGlyphBox: {
    width: 76,
    height: CARD_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.card,
  },
  formGlyphText: { fontSize: 30 },
  formGlyphLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  contentBlock: { flex: 1, minWidth: 0 },
  exampleRow: {
    height: CARD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
    ...shadows.card,
  },
  exampleEmojiBox: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  exampleEmoji: { fontSize: 24 },
  exampleText: { flexShrink: 1, minWidth: 0 },
  exampleArabic: { fontSize: 18, color: colors.textPrimary },
  // No bold weight, explicit matching fontSize — a heavier weight renders
  // visibly larger for this Arabic glyph shape even at an identical
  // fontSize (same fix already applied on the Flashcards screen and Diacritics modal).
  exampleArabicHighlight: { fontSize: 18, fontWeight: '400' },
  exampleTransliteration: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  exampleAudioIcon: { fontSize: 13, marginLeft: 'auto', opacity: 0.6 },
});
