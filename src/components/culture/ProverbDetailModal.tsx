import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import type { Proverb } from '@/constants/proverbs';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface ProverbDetailModalProps {
  proverb: Proverb | null;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<Proverb['category'], string> = {
  wisdom: 'Wisdom',
  humor: 'Humor',
  caution: 'Caution',
  honesty: 'Honesty',
  resilience: 'Resilience',
};

export function ProverbDetailModal({ proverb, onClose }: ProverbDetailModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const [isActive, setIsActive] = useState(false);
  const isVisible = proverb !== null;

  useEffect(() => {
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

  useEffect(() => {
    if (!isVisible) return;
    contentAnim.setValue(0);
    Animated.spring(contentAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [proverb?.id, isVisible, contentAnim]);

  useEffect(() => {
    if (!isSpeaking) setIsActive(false);
  }, [isSpeaking]);

  const play = () => {
    if (!proverb) return;
    Haptics.selectionAsync();
    setIsActive(true);
    speak(proverb.arabic);
  };

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {proverb ? (
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
                <Text style={styles.emoji}>{proverb.emoji}</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{CATEGORY_LABEL[proverb.category]}</Text>
                </View>

                <Text style={styles.arabic}>{proverb.arabic}</Text>
                <Text style={styles.transliteration}>{proverb.transliteration}</Text>

                <PressableScale onPress={play} style={[styles.playButton, isActive && styles.playButtonActive]}>
                  <Text style={styles.playIcon}>{isActive ? '🔊' : '▶'}</Text>
                </PressableScale>
              </Animated.View>

              <Text style={styles.sectionLabel}>Literally</Text>
              <View style={styles.card}>
                <Text style={styles.cardText}>&ldquo;{proverb.literal}&rdquo;</Text>
              </View>

              <Text style={styles.sectionLabel}>What it means</Text>
              <View style={styles.card}>
                <Text style={styles.cardText}>{proverb.meaning}</Text>
              </View>
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
  emoji: { fontSize: 56, textAlign: 'center', marginTop: spacing.sm },
  categoryBadge: {
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  arabic: {
    fontSize: 28,
    lineHeight: 42,
    textAlign: 'center',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  transliteration: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
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
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  cardText: { fontSize: 15, lineHeight: 22, color: colors.textPrimary },
});
