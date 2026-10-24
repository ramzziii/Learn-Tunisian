import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { openUpgradeFlow, PremiumBadge } from '@/components/premium/Premium';
import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Button } from '@/components/ui/Button';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchPhrasebookCategories, type PhrasebookCategory } from '@/data/content';
import { canAccessPhrasebookCategory } from '@/data/premiumAccess';
import { usePremium } from '@/lib/premium/PremiumContext';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Presentation-only metadata (icon + tile color) per phrasebook category —
 * the phrases themselves live entirely in Supabase (see
 * supabase/migrations/0007_phrasebook_content.sql), this just decorates
 * whatever unit names exist there. A category not listed here still renders,
 * with a neutral fallback look, so adding new categories later never breaks.
 * Colors are fixed hex, not theme-derived — these are brand/identity accents
 * for each category (same reasoning as the grammar screen's violet accent
 * and the celebration gradient: consistent regardless of light/dark mode). */
const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  Greetings: { emoji: '👋', color: '#F2A65A' },
  'First Encounters': { emoji: '🤝', color: '#3E7CB1' },
  'Food & Dining': { emoji: '🍽️', color: '#C0567D' },
  Health: { emoji: '🩺', color: '#4CA771' },
  Help: { emoji: '🆘', color: '#D9A441' },
  Hotel: { emoji: '🏨', color: '#B15C4A' },
  'Travel & Directions': { emoji: '🧭', color: '#4A90A4' },
  Shopping: { emoji: '🛍️', color: '#8B6BAE' },
  'Daily Life': { emoji: '🗓️', color: '#6B9080' },
  Emergencies: { emoji: '🚨', color: '#D9634C' },
};
const FALLBACK_META = { emoji: '💬', color: '#3E7CB1' };

export default function PhrasebookScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isPremium } = usePremium();
  const [categories, setCategories] = useState<PhrasebookCategory[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setCategories(await fetchPhrasebookCategories());
    } catch (error) {
      // Logged rather than swallowed — the most likely cause is
      // 0007_phrasebook_content.sql not having been run against this
      // Supabase project yet (units.is_curriculum won't exist), and this
      // makes that immediately visible in the Metro/Expo logs instead of
      // just a generic "couldn't load" on screen.
      console.error('Failed to load phrasebook categories', error);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <Text style={styles.eyebrow}>Real-life Tunisian</Text>
      <Text style={styles.title}>Phrasebook</Text>
      <Text style={styles.subtitle}>Real lines for real moments — pick a situation and learn what to say.</Text>

      {categories === null ? (
        loadError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorEmoji}>😕</Text>
            <Text style={styles.errorTitle}>Couldn&apos;t load the phrasebook</Text>
            <Button themed label="Try again" variant="secondary" onPress={load} />
          </View>
        ) : (
          <LoadingScreen themed />
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {categories.map((category, index) => {
            const meta = CATEGORY_META[category.name] ?? FALLBACK_META;
            const isLocked = !canAccessPhrasebookCategory(isPremium, category.unitId, categories);
            return (
              <Reveal key={category.unitId} delay={Math.min(index * 50, 400)}>
                <PressableScale
                  haptic
                  onPress={() =>
                    isLocked
                      ? openUpgradeFlow()
                      : router.push({ pathname: '/phrasebook/[categoryId]', params: { categoryId: category.unitId } })
                  }
                  style={[styles.card, styles.shadowCard]}
                >
                  <View style={[styles.iconTile, { backgroundColor: `${meta.color}26` }]}>
                    <Text style={styles.iconEmoji}>{meta.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>{category.name}</Text>
                      {isLocked ? <PremiumBadge /> : null}
                    </View>
                    <View style={styles.countRow}>
                      <View style={[styles.countDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.cardSubtitle}>
                        {category.phraseCount} {category.phraseCount === 1 ? 'phrase' : 'phrases'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.chevronCircle, { borderColor: meta.color }]}>
                    <Text style={[styles.chevron, { color: meta.color }]}>›</Text>
                  </View>
                </PressableScale>
              </Reveal>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    shadowCard: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 20 },
    list: { gap: spacing.md, paddingBottom: spacing.xxl },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
    },
    iconTile: {
      width: 52,
      height: 52,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconEmoji: { fontSize: 26 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    cardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    countRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    countDot: { width: 6, height: 6, borderRadius: 3 },
    cardSubtitle: { fontSize: 13, color: colors.textSecondary },
    chevronCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevron: { fontSize: 18, fontWeight: '700' },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });
