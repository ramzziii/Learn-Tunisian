import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LetterDiacriticsModal } from '@/components/alphabet/LetterDiacriticsModal';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { ARABIC_LETTERS, type ArabicLetter } from '@/lib/alphabet';
import { getAlphabetProgress, markDiacriticLetterViewed } from '@/lib/alphabetProgress';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const GRID_COLUMNS = 3;

/** Diacritics entry point: pick a letter, then see it vocalized with all three short vowels. */
export default function AlphabetDiacriticsScreen() {
  const { activeProfile } = useActiveProfile();
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.sm);
  const [selectedLetter, setSelectedLetter] = useState<ArabicLetter | null>(null);
  const [viewedLetterIds, setViewedLetterIds] = useState<string[]>([]);
  const gridAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(gridAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [gridAnim]);

  useEffect(() => {
    if (!activeProfile) return;
    getAlphabetProgress(activeProfile.id).then((data) => setViewedLetterIds(data.viewedDiacriticLetterIds));
  }, [activeProfile]);

  const selectLetter = (letter: ArabicLetter) => {
    Haptics.selectionAsync();
    setSelectedLetter(letter);
    if (!activeProfile || viewedLetterIds.includes(letter.id)) return;
    setViewedLetterIds((prev) => [...prev, letter.id]);
    markDiacriticLetterViewed(activeProfile.id, letter.id);
  };

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Diacritics</Text>
      </View>

      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>Choose a letter to hear it with fatha, damma, and kasra.</Text>
        <Text style={styles.sectionCount}>
          {viewedLetterIds.length}/{ARABIC_LETTERS.length}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View
          style={[
            styles.grid,
            {
              opacity: gridAnim,
              transform: [{ translateY: gridAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          {ARABIC_LETTERS.map((letter) => {
            const isViewed = viewedLetterIds.includes(letter.id);
            return (
              <PressableScale
                key={letter.id}
                onPress={() => selectLetter(letter)}
                style={[styles.letterCard, { width: cardWidth }, isViewed && styles.letterCardViewed]}
              >
                <Text style={styles.letter}>{letter.label}</Text>
                <Text style={styles.letterName}>{letter.name}</Text>
                <View style={[styles.underline, isViewed && styles.underlineDone]} />
              </PressableScale>
            );
          })}
        </Animated.View>
      </ScrollView>

      <LetterDiacriticsModal letter={selectedLetter} onClose={() => setSelectedLetter(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0, backgroundColor: '#F7F5F2' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EFEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  backIcon: { fontSize: 32, color: colors.textPrimary },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  subtitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  subtitle: { flex: 1, fontSize: 14, color: colors.textSecondary, marginRight: spacing.sm },
  sectionCount: { fontSize: 14, color: colors.textSecondary },
  scrollContent: { paddingBottom: spacing.xxl },
  grid: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  letterCard: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    ...shadows.card,
  },
  letterCardViewed: { backgroundColor: '#EAF6EF' },
  letter: { fontSize: 32, color: colors.textPrimary },
  letterName: { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xs, fontSize: 13 },
  underline: { width: '60%', height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm },
  underlineDone: { backgroundColor: colors.success },
});
