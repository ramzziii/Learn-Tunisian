import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { getVocalizedForms, splitAtLetter, type ArabicLetter } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface LetterDiacriticsModalProps {
  letter: ArabicLetter | null;
  onClose: () => void;
}

/** For a selected letter, shows its three short-vowel forms (fatha/damma/kasra) — each tappable to hear it, with an example word demonstrating that vowel. */
export function LetterDiacriticsModal({ letter, onClose }: LetterDiacriticsModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const isVisible = letter !== null;

  useEffect(() => {
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

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

            <Text style={styles.title}>{letter.name}</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {forms.map(({ diacritic, glyph, reading, example }) => {
                const highlighted = letter ? splitAtLetter(example.arabic, letter) : null;

                return (
                  <View key={diacritic.id} style={styles.card}>
                    <PressableScale onPress={() => speak(glyph)} style={styles.glyphButton}>
                      <Text style={styles.glyph}>{glyph}</Text>
                      <Text style={styles.reading}>{reading}</Text>
                      <Text style={styles.diacriticName}>{diacritic.name}</Text>
                    </PressableScale>

                    <PressableScale onPress={() => speak(example.arabic)} style={styles.pictureButton}>
                      <View style={styles.pictureBox}>
                        <Text style={styles.pictureEmoji}>{example.emoji ?? '🔤'}</Text>
                      </View>
                      <Text style={styles.pictureCaption} numberOfLines={1}>
                        {highlighted ? (
                          <>
                            {highlighted.before}
                            <Text style={styles.pictureCaptionHighlight}>{highlighted.match}</Text>
                            {highlighted.after}
                          </>
                        ) : (
                          example.arabic
                        )}
                      </Text>
                      <Text style={styles.pictureAudioHint}>🔊</Text>
                    </PressableScale>

                    {/* A plain View here (not another PressableScale) so flex:1 actually
                        expands within `card` — PressableScale applies the style it's given
                        to an inner Animated.View two levels below the Pressable it renders,
                        so a flex:1 passed to it never reaches the true flex child of the row. */}
                    <View style={styles.meaningBlock}>
                      <Text style={styles.meaningTransliteration} numberOfLines={1}>
                        {example.transliteration}
                      </Text>
                      <Text style={styles.meaningEnglish} numberOfLines={1}>
                        {example.english}
                      </Text>
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
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  glyphButton: {
    width: 76,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  glyph: { fontSize: 30, color: colors.textPrimary },
  reading: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginTop: 2 },
  diacriticName: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  pictureButton: {
    width: 76,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  pictureBox: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  pictureEmoji: { fontSize: 26 },
  pictureCaption: { fontSize: 15, color: colors.textPrimary, marginTop: 2 },
  pictureCaptionHighlight: { color: colors.primary, fontWeight: '800' },
  pictureAudioHint: { fontSize: 11, marginTop: 2, opacity: 0.6 },
  meaningBlock: { flex: 1, minWidth: 0 },
  meaningTransliteration: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  meaningEnglish: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
});
