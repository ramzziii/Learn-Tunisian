import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LetterDiacriticsModal } from '@/components/alphabet/LetterDiacriticsModal';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { ARABIC_LETTERS, type ArabicLetter } from '@/lib/alphabet';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const GRID_COLUMNS = 3;

/** Diacritics entry point: pick a letter, then see it vocalized with all three short vowels. */
export default function AlphabetDiacriticsScreen() {
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.sm);
  const [selectedLetter, setSelectedLetter] = useState<ArabicLetter | null>(null);

  return (
    <ScreenContainer style={styles.screen}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Diacritics</Text>
      </View>

      <Text style={styles.subtitle}>Choose a letter to hear it with fatha, damma, and kasra.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          {ARABIC_LETTERS.map((letter) => (
            <PressableScale
              key={letter.id}
              onPress={() => setSelectedLetter(letter)}
              style={[styles.letterCard, { width: cardWidth }]}
            >
              <Text style={styles.letter}>{letter.label}</Text>
              <Text style={styles.letterName}>{letter.name}</Text>
            </PressableScale>
          ))}
        </View>
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
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
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
  letter: { fontSize: 32, color: colors.textPrimary },
  letterName: { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xs, fontSize: 13 },
});
