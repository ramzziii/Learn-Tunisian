import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProverbDetailModal } from '@/components/culture/ProverbDetailModal';
import { openUpgradeFlow, PremiumBadge } from '@/components/premium/Premium';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { PROVERBS, type Proverb } from '@/constants/proverbs';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { usePremium } from '@/lib/premium/PremiumContext';
import { canAccessProverb } from '@/lib/premium/access';
import { getViewedProverbIds, markProverbViewed } from '@/lib/proverbProgress';
import { TunisianText } from '@/components/tunisian/TunisianText';
import { useColumnWidth } from '@/hooks/useColumnWidth';

const GRID_COLUMNS = 2;

export default function CultureScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const cardWidth = useColumnWidth(GRID_COLUMNS, spacing.lg, spacing.sm);
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [selectedProverb, setSelectedProverb] = useState<Proverb | null>(null);

  // Same "re-read on focus, screen stays mounted underneath" pattern as the
  // Letters screen — this Stack keeps app/culture.tsx mounted rather than
  // remounting it on back-navigation from the detail modal.
  useFocusEffect(
    useCallback(() => {
      if (!activeProfile) return;
      let cancelled = false;
      getViewedProverbIds(activeProfile.id).then((ids) => {
        if (!cancelled) setViewedIds(ids);
      });
      return () => {
        cancelled = true;
      };
    }, [activeProfile])
  );

  const { isPremium } = usePremium();

  const selectProverb = (proverb: Proverb) => {
    Haptics.selectionAsync();
    if (!canAccessProverb(isPremium, proverb.id)) {
      openUpgradeFlow();
      return;
    }
    setSelectedProverb(proverb);
    if (!activeProfile || viewedIds.includes(proverb.id)) return;
    setViewedIds((prev) => [...prev, proverb.id]);
    markProverbViewed(activeProfile.id, proverb.id);
  };

  return (
    <ScreenContainer themed style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Culture Corner</Text>
        </View>

        <View style={styles.headerCard}>
          <Text style={styles.headerText}>Real Tunisian proverbs — the wisdom (and jokes) people actually grew up on.</Text>
          <View style={styles.iconBox}>
            <Text style={styles.headerIcon}>📜</Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Proverbs</Text>
          <Text style={styles.sectionCount}>
            {viewedIds.length}/{PROVERBS.length}
          </Text>
        </View>

        <View style={styles.grid}>
          {PROVERBS.map((proverb, index) => {
            const isViewed = viewedIds.includes(proverb.id);
            const isLocked = !canAccessProverb(isPremium, proverb.id);
            return (
              <Reveal key={proverb.id} delay={Math.min(index * 40, 400)}>
                <PressableScale
                  onPress={() => selectProverb(proverb)}
                  style={[styles.card, { width: cardWidth }, isViewed && styles.cardViewed]}
                >
                  {isLocked ? <PremiumBadge style={styles.cardBadge} /> : null}
                  <Text style={styles.cardEmoji}>{proverb.emoji}</Text>
                  <TunisianText arabic={proverb.arabic} latin={proverb.transliteration} size="sm" numberOfLines={2} arabicStyle={styles.cardTransliteration} latinStyle={styles.cardTransliteration} />
                </PressableScale>
              </Reveal>
            );
          })}
        </View>
      </ScrollView>

      <ProverbDetailModal proverb={selectedProverb} onClose={() => setSelectedProverb(null)} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { padding: 0, backgroundColor: colors.background },
    scrollContent: { paddingBottom: spacing.xxl },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.lg },
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
      backgroundColor: '#8B6BAE1F',
    },
    headerText: { flex: 1, fontSize: 16, color: colors.textPrimary, fontWeight: '500', marginRight: spacing.sm },
    iconBox: {
      width: 90,
      height: 76,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#8B6BAE33',
    },
    headerIcon: { fontSize: 40 },
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
    grid: { marginHorizontal: spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    card: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 120,
      ...shadows.card,
    },
    cardBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm },
    cardViewed: { backgroundColor: `${colors.success}1F` },
    cardEmoji: { fontSize: 32 },
    cardTransliteration: {
      color: colors.textPrimary,
      fontWeight: '600',
      fontSize: 13,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
