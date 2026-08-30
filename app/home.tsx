import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { UnitSection } from '@/components/lesson-map/UnitSection';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, gradients, radii, shadows, spacing } from '@/constants/theme';
import { fetchLessonMap, type UnitWithLessons } from '@/data/content';
import { fetchReviewDueCount } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';

export default function Home() {
  const { activeProfile, profiles } = useActiveProfile();
  const [unitsWithLessons, setUnitsWithLessons] = useState<UnitWithLessons[] | null>(null);
  const [reviewDueCount, setReviewDueCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);
    try {
      const [lessonMap, dueCount] = await Promise.all([
        fetchLessonMap(activeProfile.id),
        fetchReviewDueCount(activeProfile.id),
      ]);
      setUnitsWithLessons(lessonMap);
      setReviewDueCount(dueCount);
    } catch {
      setLoadError(true);
    }
  }, [activeProfile]);

  useEffect(() => {
    setUnitsWithLessons(null);
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  if (!activeProfile) return <LoadingScreen />;

  return (
    <ScreenContainer style={{ padding: 0 }}>
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View>
          <Text style={styles.greeting}>Ahla, {activeProfile.name}!</Text>
          <Text style={styles.subGreeting}>Ready for today&apos;s lesson?</Text>
        </View>
        <View style={styles.headerActions}>
          {profiles.length > 1 ? (
            <PressableScale onPress={() => router.push('/profiles')} style={styles.iconButton}>
              <Text style={styles.icon}>👥</Text>
            </PressableScale>
          ) : null}
          <PressableScale onPress={() => router.push('/settings')} style={styles.iconButton}>
            <Text style={styles.icon}>⚙️</Text>
          </PressableScale>
        </View>
      </LinearGradient>

      {unitsWithLessons === null ? (
        loadError ? (
          <ErrorState onRetry={load} />
        ) : (
          <LoadingScreen />
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          {reviewDueCount > 0 ? (
            <PressableScale onPress={() => router.push('/review')} style={[styles.reviewCard, shadows.card]}>
              <LinearGradient
                colors={gradients.accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.reviewCardGradient}
              >
                <Text style={styles.reviewEmoji}>🔄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewTitle}>Review time</Text>
                  <Text style={styles.reviewSubtitle}>
                    {reviewDueCount} {reviewDueCount === 1 ? 'word is' : 'words are'} due for review
                  </Text>
                </View>
                <Text style={styles.reviewChevron}>›</Text>
              </LinearGradient>
            </PressableScale>
          ) : null}

          {unitsWithLessons.length === 0 ? (
            <Text style={styles.emptyText}>No lessons yet — check back soon!</Text>
          ) : (
            unitsWithLessons.map((unitWithLessons) => (
              <UnitSection
                key={unitWithLessons.unit.id}
                unitWithLessons={unitWithLessons}
                track={activeProfile.track}
                onSelectLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
                onBrowseWords={(lessonId) => router.push(`/words/${lessonId}`)}
              />
            ))
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorEmoji}>😕</Text>
      <Text style={styles.errorTitle}>Couldn&apos;t load your lessons</Text>
      <Text style={styles.errorBody}>Check your connection and try again.</Text>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.textOnPrimary },
  subGreeting: { fontSize: 14, color: colors.textOnPrimary, opacity: 0.85, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  reviewCard: { borderRadius: radii.lg, marginBottom: spacing.xl, overflow: 'hidden' },
  reviewCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  reviewEmoji: { fontSize: 32 },
  reviewTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  reviewSubtitle: { fontSize: 13, color: colors.textPrimary, opacity: 0.75, marginTop: 2 },
  reviewChevron: { fontSize: 28, color: colors.textPrimary, opacity: 0.5 },
  emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  errorBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
});
