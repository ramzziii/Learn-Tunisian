import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import type { Diacritic } from '@/lib/alphabet';
import { useLetterSpeech } from '@/hooks/useLetterSpeech';

interface DiacriticDetailModalProps {
  diacritic: Diacritic | null;
  onClose: () => void;
}

export function DiacriticDetailModal({ diacritic, onClose }: DiacriticDetailModalProps) {
  const { speak, isSpeaking } = useLetterSpeech();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const isVisible = diacritic !== null;

  useEffect(() => {
    Animated.timing(backdropAnim, { toValue: isVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isVisible, backdropAnim]);

  return (
    <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {diacritic ? (
          <View style={[styles.sheet, shadows.raised]}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>

            <Text style={styles.bigExample}>
              {diacritic.exampleLetter}
              {diacritic.symbol}
            </Text>
            <Text style={styles.name}>{diacritic.name}</Text>
            <Text style={styles.hint}>{diacritic.soundHint}</Text>
            <Text style={styles.reading}>Sounds like &quot;{diacritic.exampleReading}&quot;</Text>

            <PressableScale
              onPress={() => speak(`${diacritic.exampleLetter}${diacritic.symbol}`)}
              style={[styles.playButton, isSpeaking && styles.playButtonActive]}
            >
              <Text style={styles.playIcon}>{isSpeaking ? '🔊' : '▶'}</Text>
            </PressableScale>
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
    alignItems: 'center',
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
  bigExample: { fontSize: 72, color: colors.textPrimary, marginTop: spacing.sm },
  name: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.sm },
  hint: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
  reading: { fontSize: 14, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  playButtonActive: { backgroundColor: colors.primaryDark },
  playIcon: { fontSize: 22, color: colors.textOnPrimary },
});
