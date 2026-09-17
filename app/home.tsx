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
import {
  fetchProgressSummary,
  fetchReviewDueCount,
  fetchTodayPracticeSummary,
  type ProfileProgressSummary,
  type TodayPracticeSummary,
} from '@/data/progress';
import { fetchMinutesLearnedToday, fetchRecentActivityDates } from '@/data/sessionLogs';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { buildDailyChallenges, type DailyChallenge } from '@/lib/dailyChallenges';
import { getTodayChallengeFlags } from '@/lib/dailyChallengeProgress';
import { recommendNextStep } from '@/lib/nextStepRecommendation';
import { buildProgressInsights, type ProgressInsights } from '@/lib/progressInsights';
import { calculateStreak } from '@/lib/streak';
import type { DailyGoalMinutes, LessonWithState } from '@/types/models';

interface HomeData {
  unitsWithLessons: UnitWithLessons[];
  reviewDueCount: number;
  minutesToday: number;
  goalMinutes: DailyGoalMinutes;
  progressSummary: ProfileProgressSummary;
  todayPractice: TodayPracticeSummary;
  streakDays: number;
  dailyChallenges: DailyChallenge[];
}

const EMPTY_TODAY_PRACTICE: TodayPracticeSummary = { wordsPracticedToday: 0, wordsMasteredToday: 0 };

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
    const [reviewDueCount, minutesToday, goalSettings, progressSummary, todayPractice, activityDates, challengeFlags] =
      await Promise.all([
        fetchReviewDueCount(activeProfile.id).catch(() => 0),
        fetchMinutesLearnedToday(activeProfile.id).catch(() => 0),
        fetchDailyGoalSettings(activeProfile.id).catch(() => null),
        fetchProgressSummary(activeProfile.id).catch(
          () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 }) satisfies ProfileProgressSummary
        ),
        fetchTodayPracticeSummary(activeProfile.id).catch(() => EMPTY_TODAY_PRACTICE),
        fetchRecentActivityDates(activeProfile.id).catch(() => [] as string[]),
        getTodayChallengeFlags(activeProfile.id).catch(() => ({ reviewCompleted: false, speakingCompleted: false })),
      ]);

    setData({
      unitsWithLessons,
      reviewDueCount,
      minutesToday,
      goalMinutes: goalSettings?.dailyGoalMinutes ?? 5,
      progressSummary,
      todayPractice,
      streakDays: calculateStreak(activityDates),
      dailyChallenges: buildDailyChallenges({
        minutesToday,
        wordsPracticedToday: todayPractice.wordsPracticedToday,
        reviewCompletedToday: challengeFlags.reviewCompleted,
        speakingCompletedToday: challengeFlags.speakingCompleted,
      }),
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

/** Adult/teen: goal progress + streak, a "Learned today" recap, a weak-spot-aware
 * "Continue Learning" action, review, a light progress teaser, then the full map. */
function AdultHomeContent({ data }: { data: HomeData }) {
  const {
    unitsWithLessons,
    reviewDueCount,
    minutesToday,
    goalMinutes,
    progressSummary,
    todayPractice,
    streakDays,
    dailyChallenges,
  } = data;

  // The lesson recommendation is deliberately computed with reviewDueCount
  // forced to 0 here — review already has its own dedicated card below, so
  // this specifically picks which *lesson* to point "Continue Learning" at
  // (the weakest unlocked one) rather than re-deciding review vs. lesson.
  const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
  const progressInsights = buildProgressInsights(allLessons);
  const recommendation = recommendNextStep(allLessons, 0);
  const continueLesson = recommendation?.type === 'lesson' ? recommendation.lesson : findContinueLesson(unitsWithLessons);
  const isWeakSpotPick = recommendation?.type === 'lesson' && recommendation.reason === 'weak_spot';

  const goalProgress = goalMinutes > 0 ? minutesToday / goalMinutes : 0;
  const goalReached = minutesToday >= goalMinutes;

  return (
    <>
      <Reveal delay={0}>
        <View style={[styles.goalCard, shadows.card]}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.goalLabel}>Today&apos;s goal</Text>
            <View style={styles.goalHeaderRight}>
              {streakDays > 0 ? (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakBadgeText}>🔥 {streakDays}</Text>
                </View>
              ) : null}
              <Text style={styles.goalValue}>
                {minutesToday} / {goalMinutes} min
              </Text>
            </View>
          </View>
          <ProgressBar progress={goalProgress} gradientColors={goalReached ? gradients.success : gradients.primary} />
          {goalReached ? (
            <View style={styles.goalReachedBanner}>
              <Text style={styles.goalReachedText}>🎉 Goal reached — nice work today!</Text>
            </View>
          ) : null}
          {continueLesson ? (
            <>
              <Button
                label="Continue Learning"
                onPress={() => router.push(`/lesson/${continueLesson.id}`)}
                style={{ marginTop: spacing.md }}
              />
              {isWeakSpotPick ? (
                <Text style={styles.recommendReason}>
                  📍 Recommended — keep building up {continueLesson.title ?? continueLesson.unitName}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      </Reveal>

      <Reveal delay={30}>
        <TodayRecapCard minutesToday={minutesToday} todayPractice={todayPractice} />
      </Reveal>

      <Reveal delay={45}>
        <DailyChallengesCard challenges={dailyChallenges} />
      </Reveal>

      {reviewDueCount > 0 ? (
        <Reveal delay={60}>
          <ReviewCard dueCount={reviewDueCount} />
        </Reveal>
      ) : null}

      <Reveal delay={120}>
        <TalkToATunisianCard />
      </Reveal>
      <Reveal delay={150}>
        <SpeakingPracticeCard />
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

      {progressInsights.focusArea || progressInsights.strongArea ? (
        <Reveal delay={300}>
          <ProgressInsightsCard insights={progressInsights} />
        </Reveal>
      ) : null}

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

function SpeakingPracticeCard() {
  return (
    <PressableScale haptic onPress={() => router.push('/speaking-practice')} style={[styles.alphabetCard, shadows.card]}>
      <Text style={styles.alphabetCardEmoji}>🎙️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.alphabetCardTitle}>Speaking practice</Text>
        <Text style={styles.alphabetCardSubtitle}>Say 5 phrases out loud</Text>
      </View>
      <Text style={styles.alphabetCardChevron}>›</Text>
    </PressableScale>
  );
}

/** A compact, always-4-item checklist of the day's micro-challenges — done
 * items get a check and a strikethrough rather than disappearing, so
 * progress stays visible through the whole day instead of the list
 * shrinking as you go. */
function DailyChallengesCard({ challenges }: { challenges: DailyChallenge[] }) {
  const completedCount = challenges.filter((c) => c.isComplete).length;
  const allComplete = completedCount === challenges.length;

  return (
    <View style={[styles.recapCard, shadows.card]}>
      <View style={styles.challengesHeaderRow}>
        <Text style={styles.recapTitle}>Today&apos;s challenges</Text>
        <Text style={styles.challengesCount}>
          {completedCount}/{challenges.length}
        </Text>
      </View>
      {allComplete ? (
        <Text style={styles.challengesAllDone}>🎉 All done for today — amazing!</Text>
      ) : (
        <View style={styles.challengesList}>
          {challenges.map((challenge) => (
            <View key={challenge.id} style={styles.challengeRow}>
              <Text style={styles.challengeCheck}>{challenge.isComplete ? '✅' : challenge.emoji}</Text>
              <Text style={[styles.challengeLabel, challenge.isComplete && styles.challengeLabelDone]}>
                {challenge.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Compact "which unit needs attention vs. which is going well" summary —
 * omitted entirely by the caller when there's nothing yet to say (a
 * brand-new profile with no started units), rather than rendering an empty
 * or placeholder card. */
function ProgressInsightsCard({ insights }: { insights: ProgressInsights }) {
  return (
    <View style={[styles.recapCard, shadows.card]}>
      <Text style={styles.recapTitle}>Strengths &amp; gaps</Text>
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

/** Lightweight, always-visible "what you've learned today" recap — adapts
 * its copy to whether anything's happened yet so it never reads as a nag. */
function TodayRecapCard({
  minutesToday,
  todayPractice,
}: {
  minutesToday: number;
  todayPractice: TodayPracticeSummary;
}) {
  const hasActivity = minutesToday > 0 || todayPractice.wordsPracticedToday > 0;

  return (
    <View style={[styles.recapCard, shadows.card]}>
      <Text style={styles.recapTitle}>{hasActivity ? "Learned today" : 'Ready when you are'}</Text>
      <Text style={styles.recapSubtitle}>
        {hasActivity
          ? "Nice work — here's what you've picked up today."
          : "Your daily recap shows up here once you start a session."}
      </Text>
      <View style={styles.recapStatsRow}>
        <RecapStat value={minutesToday} label={minutesToday === 1 ? 'minute' : 'minutes'} />
        <RecapStat value={todayPractice.wordsPracticedToday} label="practiced" />
        <RecapStat value={todayPractice.wordsMasteredToday} label="mastered" />
      </View>
    </View>
  );
}

function RecapStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.recapStat}>
      <Text style={styles.recapStatValue}>{value}</Text>
      <Text style={styles.recapStatLabel}>{label}</Text>
    </View>
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
  goalHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakBadge: { backgroundColor: '#FFF1E0', borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.xs },
  streakBadgeText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  goalValue: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  goalReachedBanner: {
    backgroundColor: '#EAF6EF',
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  goalReachedText: { fontSize: 13, fontWeight: '700', color: colors.success },
  recommendReason: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  recapCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
  recapTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  recapSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  recapStatsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  recapStat: { alignItems: 'center', flex: 1 },
  recapStatValue: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  recapStatLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  challengesHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  challengesCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  challengesAllDone: { fontSize: 14, fontWeight: '700', color: colors.success, marginTop: spacing.sm },
  challengesList: { marginTop: spacing.sm, gap: spacing.xs },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  challengeCheck: { fontSize: 16, width: 22, textAlign: 'center' },
  challengeLabel: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  challengeLabelDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  insightEmoji: { fontSize: 16 },
  insightText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
  insightUnit: { fontWeight: '700', color: colors.textPrimary },
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
