import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { UnitSection } from '@/components/lesson-map/UnitSection';
import { openUpgradeFlow } from '@/components/premium/Premium';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchLessonMap, type UnitWithLessons } from '@/data/content';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { usePremium } from '@/lib/premium/PremiumContext';
import { canAccessLesson, computeFreeLessonIds } from '@/lib/premium/access';
import { buildProgressInsights, type ProgressInsights } from '@/lib/progressInsights';
import { useTheme } from '@/lib/theme/ThemeContext';

interface LearnData {
  unitsWithLessons: UnitWithLessons[];
  progressSummary: ProfileProgressSummary;
  progressInsights: ProgressInsights;
}

/**
 * The curriculum destination — extracted from Home's old bottom-of-scroll
 * lesson map (see app/(tabs)/home.tsx), reusing the exact same
 * fetchLessonMap/UnitSection/buildProgressInsights this map already used
 * there. Progress *on the curriculum* lives right next to the curriculum
 * itself now, instead of scattered across Home. Fully converted to the live
 * theme system.
 */
export default function LearnScreen() {
  const { activeProfile } = useActiveProfile();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<LearnData | null>(null);
  const { isPremium } = usePremium();
  // Derived from the already-loaded lesson map (real sort_order columns), so
  // the map marks exactly the lessons /lesson/[lessonId] would gate.
  const freeLessonIds = useMemo(
    () =>
      computeFreeLessonIds(
        data?.unitsWithLessons.map(({ unit }) => unit) ?? [],
        data?.unitsWithLessons.flatMap(({ lessons }) => lessons) ?? []
      ),
    [data]
  );
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);
    try {
      const [unitsWithLessons, progressSummary] = await Promise.all([
        fetchLessonMap(activeProfile.id),
        fetchProgressSummary(activeProfile.id).catch(
          () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 }) satisfies ProfileProgressSummary
        ),
      ]);
      const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
      setData({ unitsWithLessons, progressSummary, progressInsights: buildProgressInsights(allLessons) });
    } catch {
      setLoadError(true);
    }
  }, [activeProfile]);

  // Re-check on focus (not just mount) — switching back to this tab after
  // finishing a lesson elsewhere should reflect the lesson that just unlocked.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!activeProfile) return <LoadingScreen themed />;

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Your path</Text>
        <Text style={styles.title}>Learn</Text>
      </View>

      {data === null ? (
        loadError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorEmoji}>😕</Text>
            <Text style={styles.errorTitle}>Couldn&apos;t load your lessons</Text>
            <Button themed label="Try again" variant="secondary" onPress={load} />
          </View>
        ) : (
          <LoadingScreen themed />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Reveal delay={0}>
            <View style={styles.progressTeaserRow}>
              <ProgressTeaser value={data.progressSummary.wordsLearning} label="learning" />
              <ProgressTeaser value={data.progressSummary.wordsMastered} label="mastered" />
            </View>
          </Reveal>

          {data.progressInsights.focusArea || data.progressInsights.strongArea ? (
            <Reveal delay={30}>
              <ProgressInsightsCard insights={data.progressInsights} />
            </Reveal>
          ) : null}

          {data.unitsWithLessons.length === 0 ? (
            <Text style={styles.emptyText}>No lessons yet — check back soon!</Text>
          ) : (
            data.unitsWithLessons.map((unitWithLessons, index) => (
              <UnitSection
                key={unitWithLessons.unit.id}
                unitWithLessons={unitWithLessons}
                isFirstUnit={index === 0}
                onSelectLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
                onBrowseWords={(lessonId) => router.push(`/words/${lessonId}`)}
                isPremiumLocked={(lessonId) => !canAccessLesson(isPremium, lessonId, freeLessonIds)}
                onPremiumLockedPress={openUpgradeFlow}
              />
            ))
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

/** Compact "which unit needs attention vs. which is going well" summary —
 * omitted entirely by the caller when there's nothing yet to say (a
 * brand-new profile with no started units), rather than rendering an empty
 * or placeholder card. */
function ProgressInsightsCard({ insights }: { insights: ProgressInsights }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.insightsCard, styles.shadowCard]}>
      <Text style={styles.insightsTitle}>Strengths &amp; gaps</Text>
      {insights.focusArea ? (
        <View style={styles.insightRow}>
          <Text style={styles.insightEmoji}>🎯</Text>
          <Text style={styles.insightText}>
            Focus area: <Text style={styles.insightUnit}>{insights.focusArea.unitName}</Text> could use more practice
          </Text>
        </View>
      ) : null}
      {insights.strongArea ? (
        <View style={styles.insightRow}>
          <Text style={styles.insightEmoji}>💪</Text>
          <Text style={styles.insightText}>
            Going strong in <Text style={styles.insightUnit}>{insights.strongArea.unitName}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ProgressTeaser({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.progressTeaser}>
      <Text style={styles.progressTeaserValue}>{value}</Text>
      <Text style={styles.progressTeaserLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

  return StyleSheet.create({
    shadowCard,
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: spacing.md,
    },
    title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
    progressTeaserRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    progressTeaser: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    progressTeaserValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
    progressTeaserLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    insightsCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
    insightsTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
    insightEmoji: { fontSize: 16 },
    insightText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
    insightUnit: { fontWeight: '700', color: colors.textPrimary },
    emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });
};
