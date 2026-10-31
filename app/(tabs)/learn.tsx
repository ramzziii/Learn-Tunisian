import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LearnView } from '@/components/learn/LearnView';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { translationReadyText, useNewTranslationAnswers } from '@/components/translation/TranslationRequestsEntry';
import { spacing, type ThemeColors } from '@/constants/theme';
import { fetchLessonMap, type UnitWithLessons } from '@/data/content';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { usePremium } from '@/lib/premium/PremiumContext';
import { computeFreeLessonIds } from '@/lib/premium/access';
import { buildProgressInsights, type ProgressInsights } from '@/lib/progressInsights';
import { useTheme } from '@/lib/theme/ThemeContext';

interface LearnData {
  unitsWithLessons: UnitWithLessons[];
  progressSummary: ProfileProgressSummary;
  progressInsights: ProgressInsights;
}

/**
 * Learn — "what should I learn next?". A gradient hero with overall
 * progress, a Continue card for the one lesson that's up next, the units as
 * cards with each lesson on a path (UnitSection), and Explore Tunisian.
 * Lesson order, unlock rules and Premium gates come from fetchLessonMap and
 * src/lib/premium/access.ts, unchanged. Entrances are staggered (Reveal),
 * progress bars fill in, and the next lesson ripples — loops stop when the
 * OS asks to reduce motion.
 */
export default function LearnScreen() {
  const { activeProfile } = useActiveProfile();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<LearnData | null>(null);
  const { isPremium } = usePremium();
  // The "your translation is ready" notice moved here with its entry point.
  const translationNotice = translationReadyText(useNewTranslationAnswers());
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

  if (data === null) {
    return (
      <ScreenContainer themed>
        {loadError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorEmoji}>😕</Text>
            <Text style={styles.errorTitle}>Couldn&apos;t load your lessons</Text>
            <Button themed label="Try again" variant="secondary" onPress={load} />
          </View>
        ) : (
          <LoadingScreen themed />
        )}
      </ScreenContainer>
    );
  }

  return (
    <LearnView data={data} isPremium={isPremium} freeLessonIds={freeLessonIds} translationNotice={translationNotice} />
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  });
