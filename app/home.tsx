import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { UnitSection } from '@/components/lesson-map/UnitSection';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, gradients, radii, shadows, spacing } from '@/constants/theme';
import { fetchLessonMap, type UnitWithLessons } from '@/data/content';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { fetchProgressSummary, fetchReviewDueCount, type ProfileProgressSummary } from '@/data/progress';
import { fetchMinutesLearnedToday } from '@/data/sessionLogs';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import type { DailyGoalMinutes, LessonWithState } from '@/types/models';

interface HomeData {
  unitsWithLessons: UnitWithLessons[];
  reviewDueCount: number;
  minutesToday: number;
  goalMinutes: DailyGoalMinutes;
  progressSummary: ProfileProgressSummary;
}

function findContinueLesson(unitsWithLessons: UnitWithLessons[]): LessonWithState | null {
  const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
  return allLessons.find((l) => l.state === 'unlocked') ?? allLessons[allLessons.length - 1] ?? null;
}

export default function Home() {
  const { activeProfile, profiles } = useActiveProfile();
  const [data, setData] = useState<HomeData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);

    // The lesson map is the one thing this screen can't render without, so
    // its failure is the only one that shows the full-screen error state.
    let unitsWithLessons: UnitWithLessons[];
    try {
      unitsWithLessons = await fetchLessonMap(activeProfile.id);
    } catch {
      setLoadError(true);
      return;
    }

    // Everything else here is supplementary — a failure in any one of these
    // (e.g. a migration that hasn't been run yet) shouldn't take down the
    // whole screen with a misleading "couldn't load your lessons" message
    // when the lessons themselves loaded fine. Each just falls back to a
    // sensible default instead.
    const [reviewDueCount, minutesToday, goalSettings, progressSummary] = await Promise.all([
      fetchReviewDueCount(activeProfile.id).catch(() => 0),
      fetchMinutesLearnedToday(activeProfile.id).catch(() => 0),
      fetchDailyGoalSettings(activeProfile.id).catch(() => null),
      fetchProgressSummary(activeProfile.id).catch(
        () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 }) satisfies ProfileProgressSummary
      ),
    ]);

    setData({
      unitsWithLessons,
      reviewDueCount,
      minutesToday,
      goalMinutes: goalSettings?.dailyGoalMinutes ?? 5,
      progressSummary,
    });
  }, [activeProfile]);

  useEffect(() => {
    setData(null);
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
      <HomeHeader
        name={activeProfile.name}
        hasMultipleProfiles={profiles.length > 1}
        onSwitchProfile={() => router.push('/profiles')}
        onOpenSettings={() => router.push('/settings')}
      />

      {data === null ? (
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
          {activeProfile.track === 'kid' ? (
            <KidHomeContent data={data} />
          ) : (
            <AdultHomeContent data={data} />
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function HomeHeader({
  name,
  hasMultipleProfiles,
  onSwitchProfile,
  onOpenSettings,
}: {
  name: string;
  hasMultipleProfiles: boolean;
  onSwitchProfile: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <View>
        <Text style={styles.greeting}>Ahla, {name}!</Text>
        <Text style={styles.subGreeting}>Ready for today&apos;s lesson?</Text>
      </View>
      <View style={styles.headerActions}>
        {hasMultipleProfiles ? (
          <PressableScale haptic onPress={onSwitchProfile} style={styles.iconButton}>
            <Text style={styles.icon}>👥</Text>
          </PressableScale>
        ) : null}
        <PressableScale haptic onPress={onOpenSettings} style={styles.iconButton}>
          <Text style={styles.icon}>⚙️</Text>
        </PressableScale>
      </View>
    </LinearGradient>
  );
}

/** Adult/teen: goal progress, a primary "Continue Learning" action, review, a light progress teaser, then the full map. */
function AdultHomeContent({ data }: { data: HomeData }) {
  const { unitsWithLessons, reviewDueCount, minutesToday, goalMinutes, progressSummary } = data;
  const continueLesson = findContinueLesson(unitsWithLessons);
  const goalProgress = goalMinutes > 0 ? minutesToday / goalMinutes : 0;
  const goalReached = minutesToday >= goalMinutes;

  return (
    <>
      <Reveal delay={0}>
        <View style={[styles.goalCard, shadows.card]}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.goalLabel}>Today&apos;s goal</Text>
            <Text style={styles.goalValue}>
              {minutesToday} / {goalMinutes} min
            </Text>
          </View>
          <ProgressBar progress={goalProgress} gradientColors={goalReached ? gradients.success : gradients.primary} />
          {continueLesson ? (
            <Button
              label="Continue Learning"
              onPress={() => router.push(`/lesson/${continueLesson.id}`)}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </View>
      </Reveal>

      {reviewDueCount > 0 ? (
        <Reveal delay={60}>
          <ReviewCard dueCount={reviewDueCount} />
        </Reveal>
      ) : null}

      <Reveal delay={120}>
        <TalkToATunisianCard />
      </Reveal>
      <Reveal delay={180}>
        <AlphabetPracticeCard />
      </Reveal>
      <Reveal delay={210}>
        <CultureCornerCard />
      </Reveal>

      <Reveal delay={270}>
        <View style={styles.progressTeaserRow}>
          <ProgressTeaser value={progressSummary.wordsLearning} label="learning" />
          <ProgressTeaser value={progressSummary.wordsMastered} label="mastered" />
        </View>
      </Reveal>

      <LessonMap unitsWithLessons={unitsWithLessons} track="adult" />
    </>
  );
}

/** Kid: one big friendly action, a simple review nudge, then the map — no numbers, no goal tracking. */
function KidHomeContent({ data }: { data: HomeData }) {
  const { unitsWithLessons, reviewDueCount } = data;
  const continueLesson = findContinueLesson(unitsWithLessons);

  return (
    <>
      {continueLesson ? (
        <Reveal delay={0}>
          <PressableScale
            haptic
            onPress={() => router.push(`/lesson/${continueLesson.id}`)}
            style={[styles.kidHeroCard, shadows.raised]}
          >
            <LinearGradient
              colors={gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.kidHeroGradient}
            >
              <Text style={styles.kidHeroEmoji}>🚀</Text>
              <Text style={styles.kidHeroLabel}>Let&apos;s learn!</Text>
            </LinearGradient>
          </PressableScale>
        </Reveal>
      ) : null}

      {reviewDueCount > 0 ? (
        <Reveal delay={60}>
          <PressableScale
            haptic
            onPress={() => router.push('/review')}
            style={[styles.kidReviewCard, shadows.card]}
          >
            <Text style={styles.kidReviewEmoji}>🔄</Text>
            <Text style={styles.kidReviewLabel}>Review</Text>
          </PressableScale>
        </Reveal>
      ) : null}

      <Reveal delay={120}>
        <AlphabetPracticeCard />
      </Reveal>
      <Reveal delay={150}>
        <CultureCornerCard />
      </Reveal>

      <LessonMap unitsWithLessons={unitsWithLessons} track="kid" />
    </>
  );
}

function AlphabetPracticeCard() {
  return (
    <PressableScale haptic onPress={() => router.push('/alphabet')} style={[styles.alphabetCard, shadows.card]}>
      <Text style={styles.alphabetCardEmoji}>🅰️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.alphabetCardTitle}>Alphabet practice</Text>
        <Text style={styles.alphabetCardSubtitle}>Learn letters and sounds</Text>
      </View>
      <Text style={styles.alphabetCardChevron}>›</Text>
    </PressableScale>
  );
}

function CultureCornerCard() {
  return (
    <PressableScale haptic onPress={() => router.push('/culture')} style={[styles.alphabetCard, shadows.card]}>
      <Text style={styles.alphabetCardEmoji}>📜</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.alphabetCardTitle}>Culture Corner</Text>
        <Text style={styles.alphabetCardSubtitle}>Real Tunisian proverbs & sayings</Text>
      </View>
      <Text style={styles.alphabetCardChevron}>›</Text>
    </PressableScale>
  );
}

function ReviewCard({ dueCount }: { dueCount: number }) {
  return (
    <PressableScale haptic onPress={() => router.push('/review')} style={[styles.reviewCard, shadows.card]}>
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
            {dueCount} {dueCount === 1 ? 'word is' : 'words are'} due for review
          </Text>
        </View>
        <Text style={styles.reviewChevron}>›</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function TalkToATunisianCard() {
  return (
    <PressableScale haptic onPress={() => router.push('/talk')} style={[styles.reviewCard, shadows.card]}>
      <LinearGradient
        colors={gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.reviewCardGradient}
      >
        <Text style={styles.reviewEmoji}>🇹🇳</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.reviewTitle, { color: colors.textOnPrimary }]}>Talk to a Tunisian</Text>
          <Text style={[styles.reviewSubtitle, { color: colors.textOnPrimary }]}>Practice a real conversation</Text>
        </View>
        <Text style={[styles.reviewChevron, { color: colors.textOnPrimary }]}>›</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function ProgressTeaser({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.progressTeaser}>
      <Text style={styles.progressTeaserValue}>{value}</Text>
      <Text style={styles.progressTeaserLabel}>{label}</Text>
    </View>
  );
}

function LessonMap({
  unitsWithLessons,
  track,
}: {
  unitsWithLessons: UnitWithLessons[];
  track: 'kid' | 'adult';
}) {
  if (unitsWithLessons.length === 0) {
    return <Text style={styles.emptyText}>No lessons yet — check back soon!</Text>;
  }
  return (
    <>
      {unitsWithLessons.map((unitWithLessons) => (
        <UnitSection
          key={unitWithLessons.unit.id}
          unitWithLessons={unitWithLessons}
          track={track}
          onSelectLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
          onBrowseWords={(lessonId) => router.push(`/words/${lessonId}`)}
        />
      ))}
    </>
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
  goalCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  goalLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  goalValue: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  progressTeaserRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  progressTeaser: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  progressTeaserValue: { fontSize: 18, fontWeight: '800', color: colors.primaryDark },
  progressTeaserLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reviewCard: { borderRadius: radii.lg, marginBottom: spacing.xl, overflow: 'hidden' },
  reviewCardGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  reviewEmoji: { fontSize: 32 },
  reviewTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  reviewSubtitle: { fontSize: 13, color: colors.textPrimary, opacity: 0.75, marginTop: 2 },
  reviewChevron: { fontSize: 28, color: colors.textPrimary, opacity: 0.5 },
  alphabetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  alphabetCardEmoji: { fontSize: 32 },
  alphabetCardTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  alphabetCardSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  alphabetCardChevron: { fontSize: 30, color: colors.textSecondary },
  kidHeroCard: { borderRadius: radii.lg, marginBottom: spacing.lg, overflow: 'hidden' },
  kidHeroGradient: { alignItems: 'center', paddingVertical: spacing.xl },
  kidHeroEmoji: { fontSize: 56 },
  kidHeroLabel: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  kidReviewCard: {
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  kidReviewEmoji: { fontSize: 32 },
  kidReviewLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xs },
  emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  errorBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
});
