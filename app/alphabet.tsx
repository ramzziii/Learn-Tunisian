import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DiacriticDetailModal } from '@/components/alphabet/DiacriticDetailModal';
import { LetterDetailModal } from '@/components/alphabet/LetterDetailModal';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, shadows, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { ARABIC_LETTERS, DIACRITICS, type ArabicLetter, type Diacritic } from '@/lib/alphabet';
import { getAlphabetProgress } from '@/lib/alphabetProgress';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const GRID_COLUMNS = 3;

export default function AlphabetScreen() {
  const { activeProfile } = useActiveProfile();
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.sm);
  const [practicedLetterIds, setPracticedLetterIds] = useState<string[]>([]);
  const [practicedDiacriticIds, setPracticedDiacriticIds] = useState<string[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<ArabicLetter | null>(null);
  const [selectedDiacritic, setSelectedDiacritic] = useState<Diacritic | null>(null);

  // Re-read local progress every time this screen regains focus (e.g. after
  // finishing a practice round), since the Stack keeps this screen mounted
  // underneath rather than remounting it on back-navigation.
  useFocusEffect(
    useCallback(() => {
      if (!activeProfile) return;
      let cancelled = false;
      getAlphabetProgress(activeProfile.id).then((data) => {
        if (cancelled) return;
        setPracticedLetterIds(data.practicedLetterIds);
        setPracticedDiacriticIds(data.practicedDiacriticIds);
      });
      return () => {
        cancelled = true;
      };
    }, [activeProfile])
  );

  const progressPercent =
    ARABIC_LETTERS.length > 0 ? Math.round((practicedLetterIds.length / ARABIC_LETTERS.length) * 100) : 0;

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title}>My Arabic Alphabet</Text>
        </View>

        <View style={styles.headerCard}>
          <Text style={styles.headerText}>Learn Arabic letters — sounds, shapes, and example words.</Text>
          <View style={styles.beeBox}>
            <Text style={styles.bee}>🐝</Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>{progressPercent}%</Text>
        </View>

        <View style={styles.quickLinksRow}>
          <QuickLinkCard
            label="Flashcards"
            icon="▣"
            color="#F2E6D8"
            onPress={() => router.push('/alphabet-flashcards')}
          />
          <QuickLinkCard
            label="Speed Match"
            icon="▤"
            color="#E6DEF2"
            onPress={() => router.push('/alphabet-matching')}
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Letters</Text>
          <Text style={styles.sectionCount}>
            {practicedLetterIds.length}/{ARABIC_LETTERS.length}
          </Text>
        </View>

        <View style={styles.grid}>
          {ARABIC_LETTERS.map((letter) => (
            <PressableScale
              key={letter.id}
              onPress={() => setSelectedLetter(letter)}
              style={[
                styles.letterCard,
                { width: cardWidth },
                practicedLetterIds.includes(letter.id) && styles.letterCardPracticed,
              ]}
            >
              <Text style={styles.letter}>{letter.label}</Text>
              <Text style={styles.letterName}>{letter.name}</Text>
              <View style={[styles.underline, practicedLetterIds.includes(letter.id) && styles.underlineDone]} />
            </PressableScale>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Diacritics</Text>
          <Text style={styles.sectionCount}>
            {practicedDiacriticIds.length}/{DIACRITICS.length}
          </Text>
        </View>

        <View style={styles.grid}>
          {DIACRITICS.map((diacritic) => (
            <PressableScale
              key={diacritic.id}
              onPress={() => setSelectedDiacritic(diacritic)}
              style={[
                styles.letterCard,
                { width: cardWidth },
                practicedDiacriticIds.includes(diacritic.id) && styles.letterCardPracticed,
              ]}
            >
              <Text style={styles.letter}>
                {diacritic.exampleLetter}
                {diacritic.symbol}
              </Text>
              <Text style={styles.letterName}>{diacritic.name}</Text>
              <View
                style={[styles.underline, practicedDiacriticIds.includes(diacritic.id) && styles.underlineDone]}
              />
            </PressableScale>
          ))}
        </View>

        <Button label="Learn the letters" onPress={() => router.push('/alphabet-practice')} style={styles.cta} />
      </ScrollView>

      <LetterDetailModal letter={selectedLetter} onClose={() => setSelectedLetter(null)} />
      <DiacriticDetailModal diacritic={selectedDiacritic} onClose={() => setSelectedDiacritic(null)} />
    </ScreenContainer>
  );
}

function QuickLinkCard({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={[styles.quickLinkCard, { backgroundColor: color }]}>
      <Text style={styles.quickLinkIcon}>{icon}</Text>
      <Text style={styles.quickLinkLabel}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0, backgroundColor: '#F7F5F2' },
  scrollContent: { paddingBottom: spacing.xxl },
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
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#F2E6D8',
  },
  headerText: { flex: 1, fontSize: 16, color: colors.textPrimary, fontWeight: '500', marginRight: spacing.sm },
  beeBox: {
    width: 90,
    height: 76,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1E8D3',
  },
  bee: { fontSize: 44 },
  progressRow: { marginHorizontal: spacing.lg, marginTop: spacing.md, alignItems: 'flex-end' },
  progressLabel: { fontSize: 18, color: colors.textPrimary, fontWeight: '700' },
  quickLinksRow: { flexDirection: 'row', gap: spacing.md, marginHorizontal: spacing.lg, marginTop: spacing.md },
  quickLinkCard: {
    flex: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  quickLinkIcon: { fontSize: 26 },
  quickLinkLabel: { marginTop: spacing.xs, fontWeight: '700', color: colors.textPrimary },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  sectionCount: { fontSize: 14, color: colors.textSecondary },
  grid: {
    marginHorizontal: spacing.lg,
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
  letterCardPracticed: { backgroundColor: '#EAF6EF' },
  letter: { fontSize: 32, color: colors.textPrimary },
  letterName: { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xs, fontSize: 13 },
  underline: { width: '60%', height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm },
  underlineDone: { backgroundColor: colors.success },
  cta: { marginHorizontal: spacing.lg, marginTop: spacing.xl },
});
