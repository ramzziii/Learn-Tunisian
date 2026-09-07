import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { getVocalizedForms, splitAtLetter, type ArabicLetter, type DiacriticId } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface LetterDiacriticsModalProps {
  letter: ArabicLetter | null;
  onClose: () => void;
}

// Reuses the app's existing palette rather than introducing new colors — one
// accent per vowel so the three rows stay easy to tell apart at a glance.
const ACCENT_BY_DIACRITIC: Record<DiacriticId, string> = {
  fatha: colors.primary,
  damma: colors.accent,
  kasra: colors.success,
};

type PlaybackTarget = 'glyph' | 'word';

// Shared by both the letter box and the picture/word box so they line up —
// an explicit height rather than flex-stretching them to match, since
// PressableScale applies the style it's given to an inner Animated.View
// rather than the Pressable it renders, so a stretch/flex on that style
// never reaches the actual flex child of the row.
const CARD_ROW_HEIGHT = 84;

/** For a selected letter, shows its three short-vowel forms (fatha/damma/kasra) — each tappable to hear it, with an example word demonstrating that vowel. */
export function LetterDiacriticsModal({ letter, onClose }: LetterDiacriticsModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const cardAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const isVisible = letter !== null;

  useEffect(() => {
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

  useEffect(() => {
    if (!isVisible) return;
    cardAnims.forEach((anim) => anim.setValue(0));
    Animated.stagger(
      70,
      cardAnims.map((anim) => Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }))
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter?.id]);

  useEffect(() => {
    if (!isSpeaking) setActiveKey(null);
  }, [isSpeaking]);

  const play = (diacriticId: DiacriticId, target: PlaybackTarget, text: string) => {
    Haptics.selectionAsync();
    setActiveKey(`${diacriticId}-${target}`);
    speak(text);
  };

  const playHeading = () => {
    if (!letter) return;
    Haptics.selectionAsync();
    setActiveKey('heading');
    speak(letter.label);
  };

  const forms = letter ? getVocalizedForms(letter) : [];

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {letter ? (
          <View style={[styles.sheet, shadows.raised]}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>

            <Text style={styles.headingLetter}>{letter.label}</Text>
            <Text style={styles.title}>{letter.name}</Text>

            <PressableScale
              onPress={playHeading}
              style={[styles.playButton, activeKey === 'heading' && styles.playButtonActive]}
            >
              <Text style={styles.playIcon}>{activeKey === 'heading' ? '🔊' : '▶'}</Text>
            </PressableScale>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>Examples</Text>
                <Text style={styles.subtitle}>Tap a card to hear it</Text>
              </View>
              {forms.map(({ diacritic, glyph, reading, example }, index) => {
                const diacriticId = diacritic.id as DiacriticId;
                const highlighted = letter ? splitAtLetter(example.arabic, letter) : null;
                const accent = ACCENT_BY_DIACRITIC[diacriticId];
                const isGlyphActive = activeKey === `${diacriticId}-glyph`;
                const isWordActive = activeKey === `${diacriticId}-word`;
                const cardAnim = cardAnims[index];

                return (
                  <Animated.View
                    key={diacritic.id}
                    style={[
                      styles.card,
                      { borderLeftColor: accent },
                      {
                        opacity: cardAnim,
                        transform: [{ translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                      },
                    ]}
                  >
                    <PressableScale
                      onPress={() => play(diacriticId, 'glyph', glyph)}
                      style={[styles.glyphButton, isGlyphActive && { borderColor: accent }]}
                    >
                      <Text style={[styles.glyph, { color: accent }]}>{glyph}</Text>
                      <Text style={styles.reading}>{reading}</Text>
                      <Text style={styles.diacriticName}>{diacritic.name}</Text>
                    </PressableScale>

                    {/* A plain View here (not another PressableScale) so flex:1 actually
                        expands within `card` — PressableScale applies the style it's given
                        to an inner Animated.View two levels below the Pressable it renders,
                        so a flex:1 passed to it never reaches the true flex child of the row. */}
                    <View style={styles.contentBlock}>
                      <PressableScale
                        onPress={() => play(diacriticId, 'word', example.arabic)}
                        style={[styles.pictureRow, isWordActive && { borderColor: accent }]}
                      >
                        <View style={styles.pictureBox}>
                          <Text style={styles.pictureEmoji}>{example.emoji ?? '🔤'}</Text>
                        </View>

                        <View style={styles.pictureTextColumn}>
                          <Text style={styles.pictureCaption} numberOfLines={1}>
                            {highlighted ? (
                              <>
                                {highlighted.before}
                                <Text style={[styles.pictureCaptionHighlight, { color: accent }]}>
                                  {highlighted.match}
                                </Text>
                                {highlighted.after}
                              </>
                            ) : (
                              example.arabic
                            )}
                          </Text>
                          <Text style={styles.meaningText} numberOfLines={1}>
                            {example.transliteration} · {example.english}
                          </Text>
                        </View>

                        <Text style={styles.pictureAudioHint}>{isWordActive ? '🔊' : '🔈'}</Text>
                      </PressableScale>
                    </View>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
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
  headingLetter: { fontSize: 64, textAlign: 'center', color: colors.textPrimary, marginTop: spacing.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  playButton: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    ...shadows.card,
  },
  playButtonActive: { backgroundColor: colors.primaryDark },
  playIcon: { fontSize: 22, color: colors.textOnPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
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
  glyphButton: {
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
  glyph: { fontSize: 30 },
  reading: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginTop: 2 },
  diacriticName: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  contentBlock: { flex: 1, minWidth: 0 },
  pictureRow: {
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
  pictureBox: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  pictureEmoji: { fontSize: 24 },
  pictureTextColumn: { flexShrink: 1, minWidth: 0 },
  pictureCaption: { fontSize: 18, color: colors.textPrimary },
  // No bold weight, explicit matching fontSize — a heavier weight renders
  // visibly larger for this Arabic glyph shape even at an identical
  // fontSize, which reads as "bigger" rather than just "different color"
  // (same fix already applied on the Flashcards screen and Letters modal).
  pictureCaptionHighlight: { fontSize: 18, fontWeight: '400' },
  meaningText: { fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize', marginTop: 1 },
  pictureAudioHint: { fontSize: 13, marginLeft: 'auto', opacity: 0.6 },
});
