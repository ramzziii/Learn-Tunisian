import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LetterDetailModal } from '@/components/alphabet/LetterDetailModal';
import { openUpgradeFlow, PremiumBadge } from '@/components/premium/Premium';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { ARABIC_LETTERS, type ArabicLetter } from '@/lib/alphabet';
import { getAlphabetProgress, markLetterViewed } from '@/lib/alphabetProgress';
import { canAccessLetter } from '@/lib/premium/access';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const GRID_COLUMNS = 3;

export default function AlphabetScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.sm);
  const [practicedLetterIds, setPracticedLetterIds] = useState<string[]>([]);
  const [viewedLetterIds, setViewedLetterIds] = useState<string[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<ArabicLetter | null>(null);

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
        setViewedLetterIds(data.viewedLetterIds);
      });
      return () => {
        cancelled = true;
      };
    }, [activeProfile])
  );

  // A letter counts as "accessed" for the grid's coloring if it's either
  // been practiced through an exercise or just opened in the detail view —
  // same "visited" idea the Diacritics screen's own letter picker uses.
  // Kept separate from practicedLetterIds itself so completing a real
  // exercise still means something distinct, but the grid and its counter
  // reflect the broader signal a viewer actually sees colored in.
  const accessedLetterIds = Array.from(new Set([...practicedLetterIds, ...viewedLetterIds]));
  const progressPercent =
    ARABIC_LETTERS.length > 0 ? Math.round((accessedLetterIds.length / ARABIC_LETTERS.length) * 100) : 0;

  const isPremium = activeProfile?.isPremium ?? false;

  const selectLetter = (letter: ArabicLetter) => {
    Haptics.selectionAsync();
    if (!canAccessLetter(isPremium, letter.id)) {
      openUpgradeFlow();
      return;
    }
    setSelectedLetter(letter);
    if (!activeProfile || viewedLetterIds.includes(letter.id)) return;
    setViewedLetterIds((prev) => [...prev, letter.id]);
    markLetterViewed(activeProfile.id, letter.id);
  };

  return (
    <ScreenContainer themed style={styles.screen}>
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
            color="#D9A44126"
            onPress={() => router.push('/alphabet-flashcards')}
          />
          <QuickLinkCard
            label="Speed Match"
            icon="▤"
            color="#8B6BAE26"
            onPress={() => router.push('/alphabet-matching')}
          />
          <QuickLinkCard
            label="Diacritics"
            icon="ً"
            color="#4CA77126"
            onPress={() => router.push('/alphabet-diacritics')}
          />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Letters</Text>
          <Text style={styles.sectionCount}>
            {accessedLetterIds.length}/{ARABIC_LETTERS.length}
          </Text>
        </View>

        <View style={styles.grid}>
          {ARABIC_LETTERS.map((letter) => {
            const isAccessed = accessedLetterIds.includes(letter.id);
            const isLocked = !canAccessLetter(isPremium, letter.id);
            return (
              <PressableScale
                key={letter.id}
                onPress={() => selectLetter(letter)}
                style={[styles.letterCard, { width: cardWidth }, isAccessed && styles.letterCardPracticed]}
              >
                {isLocked ? (
                  <PremiumBadge compact style={styles.lockBadge} />
                ) : letter.arabiziNote ? (
                  <View style={styles.arabiziBadge}>
                    <Text style={styles.arabiziBadgeText}>{letter.arabiziNote.label}</Text>
                  </View>
                ) : null}
                <Text style={[styles.letter, isLocked && styles.lockedText]}>{letter.label}</Text>
                <Text style={[styles.letterName, isLocked && styles.lockedText]}>{letter.name}</Text>
                <View style={[styles.underline, isAccessed && styles.underlineDone]} />
              </PressableScale>
            );
          })}
        </View>

        <Button themed label="Learn the letters" onPress={() => router.push('/alphabet-practice')} style={styles.cta} />
      </ScrollView>

      <LetterDetailModal letter={selectedLetter} onClose={() => setSelectedLetter(null)} />
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <PressableScale onPress={onPress} style={[styles.quickLinkCard, { backgroundColor: color }]}>
      <Text style={styles.quickLinkIcon}>{icon}</Text>
      <Text style={styles.quickLinkLabel}>{label}</Text>
    </PressableScale>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { padding: 0, backgroundColor: colors.background },
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
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
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
      backgroundColor: '#D9A4411F',
    },
    headerText: { flex: 1, fontSize: 16, color: colors.textPrimary, fontWeight: '500', marginRight: spacing.sm },
    beeBox: {
      width: 90,
      height: 76,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#D9A44133',
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
    lockBadge: { position: 'absolute', top: 6, right: 6 },
    lockedText: { opacity: 0.45 },
    letterCardPracticed: { backgroundColor: `${colors.success}1F` },
    arabiziBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    arabiziBadgeText: { fontSize: 9, fontWeight: '700', color: colors.textOnPrimary },
    letter: { fontSize: 32, color: colors.textPrimary },
    letterName: { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xs, fontSize: 13 },
    underline: { width: '60%', height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm },
    underlineDone: { backgroundColor: colors.success },
    cta: { marginHorizontal: spacing.lg, marginTop: spacing.xl },
  });
