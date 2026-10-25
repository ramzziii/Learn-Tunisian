import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { KIDS_SECTION_ENABLED } from '@/constants/features';
import { fetchBadgeStats } from '@/data/badgeStats';
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
import { evaluateBadges, type Badge } from '@/lib/badges';
import { buildDailyChallenges, type DailyChallenge } from '@/lib/dailyChallenges';
import { getTodayChallengeFlags } from '@/lib/dailyChallengeProgress';
import { recommendNextStep, type NextStepRecommendation } from '@/lib/nextStepRecommendation';
import { calculateStreak } from '@/lib/streak';
import { useTheme } from '@/lib/theme/ThemeContext';
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
  badges: Badge[];
}

const EMPTY_TODAY_PRACTICE: TodayPracticeSummary = { wordsPracticedToday: 0, wordsMasteredToday: 0 };

function findContinueLesson(unitsWithLessons: UnitWithLessons[]): LessonWithState | null {
  const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
  return allLessons.find((l) => l.state === 'unlocked') ?? allLessons[allLessons.length - 1] ?? null;
}

/**
 * Home is deliberately thin now — greeting, today's progress, one
 * recommendation, quick actions to the other tabs, daily challenges.
 * Everything that used to live here (the full lesson map, Culture Corner,
 * Talk, Alphabet/Speaking practice, progress insights) now has its own
 * destination on the Learn/Practice/Talk/Profile tabs — see
 * app/(tabs)/_layout.tsx.
 *
 * This screen (and its sub-components) is fully converted to the live
 * theme system — see src/lib/theme/ThemeContext.tsx.
 */
export default function Home() {
  const { activeProfile } = useActiveProfile();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<HomeData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);

    // The lesson map data is only used here to compute the "Recommended
    // next" pick (see recommendNextStep below) — the map itself now lives
    // on the Learn tab — so its failure still shows the full-screen error
    // state, since without it there's no recommendation to show either.
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
    const [
      reviewDueCount,
      minutesToday,
      goalSettings,
      progressSummary,
      todayPractice,
      activityDates,
      challengeFlags,
      badges,
    ] = await Promise.all([
      fetchReviewDueCount(activeProfile.id).catch(() => 0),
      fetchMinutesLearnedToday(activeProfile.id).catch(() => 0),
      fetchDailyGoalSettings(activeProfile.id).catch(() => null),
      fetchProgressSummary(activeProfile.id).catch(
        () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 }) satisfies ProfileProgressSummary
      ),
      fetchTodayPracticeSummary(activeProfile.id).catch(() => EMPTY_TODAY_PRACTICE),
      fetchRecentActivityDates(activeProfile.id).catch(() => [] as string[]),
      getTodayChallengeFlags(activeProfile.id).catch(() => ({ reviewCompleted: false, speakingCompleted: false })),
      fetchBadgeStats(activeProfile.id)
        .then(evaluateBadges)
        .catch(() => [] as Badge[]),
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
      badges,
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

  if (!activeProfile) return <LoadingScreen themed />;

  // Kids section is hidden for now (see src/constants/features.ts) — any
  // kid-track profile falls back to the adult experience instead of kid
  // UI/badges/celebration. Nothing kid-related is deleted; this is the one
  // gate that makes it all unreachable while the flag is off.
  const showKidUI = KIDS_SECTION_ENABLED && activeProfile.track === 'kid';

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <HomeHeader name={activeProfile.name} />

      {data === null ? (
        loadError ? (
          <ErrorState onRetry={load} />
        ) : (
          <LoadingScreen themed />
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {showKidUI ? <KidHomeContent data={data} /> : <AdultHomeContent data={data} />}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

/** No icons anymore — Settings/profile-switching live on the Profile tab now,
 * so there's nothing left for a header icon to launch. */
function HomeHeader({ name }: { name: string }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <Text style={styles.greeting}>Ahla, {name}!</Text>
      <Text style={styles.subGreeting}>Ready for today&apos;s lesson?</Text>
    </LinearGradient>
  );
}

/** Goal/streak progress, one recommendation, quick actions to the other
 * tabs, daily challenges — exactly four zones, nothing more. */
function AdultHomeContent({ data }: { data: HomeData }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { unitsWithLessons, reviewDueCount, minutesToday, goalMinutes, progressSummary, dailyChallenges } = data;

  // A single decision, not two parallel ones: review outranks a new/weak
  // lesson (spaced repetition only works if reviews actually happen), so
  // this is the one thing Home tells the user to do next.
  const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
  const recommendation = recommendNextStep(allLessons, reviewDueCount);

  const goalProgress = goalMinutes > 0 ? minutesToday / goalMinutes : 0;
  const goalReached = minutesToday >= goalMinutes;

  return (
    <>
      <Reveal delay={0}>
        <View style={[styles.goalCard, styles.shadowCard]}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.goalLabel}>Today&apos;s goal</Text>
            <View style={styles.goalHeaderRight}>
              {data.streakDays > 0 ? (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakBadgeText}>🔥 {data.streakDays}</Text>
                </View>
              ) : null}
              <Text style={styles.goalValue}>
                {minutesToday} / {goalMinutes} min
              </Text>
            </View>
          </View>
          <ProgressBar themed progress={goalProgress} gradientColors={goalReached ? gradients.success : gradients.primary} />
          {goalReached ? (
            <View style={styles.goalReachedBanner}>
              <Text style={styles.goalReachedText}>🎉 Goal reached — nice work today!</Text>
            </View>
          ) : null}
        </View>
      </Reveal>

      <Reveal delay={15}>
        <TodaysPracticeCard reviewDueCount={reviewDueCount} />
      </Reveal>

      <Reveal delay={30}>
        <RecommendedNextCard recommendation={recommendation} isFirstLesson={progressSummary.totalWordsSeen === 0} />
      </Reveal>

      <Reveal delay={60}>
        <QuickActionsRow />
      </Reveal>

      <Reveal delay={90}>
        <DailyChallengesCard challenges={dailyChallenges} />
      </Reveal>
    </>
  );
}

/** Kid: one big friendly action, a simple review nudge, badges — the full
 * curriculum map and other practice features live on the Learn/Practice
 * tabs now, same as for adults, instead of a second copy inlined here. */
function KidHomeContent({ data }: { data: HomeData }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { unitsWithLessons, reviewDueCount, badges } = data;
  const continueLesson = findContinueLesson(unitsWithLessons);

  return (
    <>
      <Reveal delay={0}>
        <BadgesShelf badges={badges} />
      </Reveal>

      {continueLesson ? (
        <Reveal delay={30}>
          <PressableScale
            haptic
            onPress={() => router.push(`/lesson/${continueLesson.id}`)}
            style={[styles.kidHeroCard, styles.shadowRaised]}
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
            style={[styles.kidReviewCard, styles.shadowCard]}
          >
            <Text style={styles.kidReviewEmoji}>🔄</Text>
            <Text style={styles.kidReviewLabel}>Review</Text>
          </PressableScale>
        </Reveal>
      ) : null}
    </>
  );
}

/** A horizontal shelf of earned/locked badge medallions — see src/lib/badges.ts
 * for how earned status is derived (always live, never stored). */
function BadgesShelf({ badges }: { badges: Badge[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (badges.length === 0) return null;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.badgesTitle}>My Badges</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesRow}>
        {badges.map((badge) => (
          <View key={badge.id} style={styles.badgeItem}>
            <View style={[styles.badgeCircle, badge.earned ? styles.badgeCircleEarned : styles.badgeCircleLocked]}>
              <Text style={[styles.badgeEmoji, !badge.earned && styles.badgeEmojiLocked]}>{badge.emoji}</Text>
            </View>
            <Text style={styles.badgeLabel} numberOfLines={1}>
              {badge.title}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// One tint per action, same "colored icon tile" language already used on
// the Phrasebook category cards — distinguishes the four actions from each
// other instead of four identical gray boxes, and matches the rest of the
// app's visual vocabulary instead of being a plainer one-off. '#8B6BAE' is
// the exact violet Phrasebook already uses elsewhere, reused here rather
// than inventing a new one-off color.
const QUICK_ACTIONS: {
  emoji: string;
  label: string;
  href: '/learn' | '/practice' | '/talk' | '/review';
  tint: (colors: ThemeColors) => string;
}[] = [
  { emoji: '📚', label: 'Learn', href: '/learn', tint: (c) => c.primary },
  { emoji: '🎯', label: 'Practice', href: '/practice', tint: (c) => c.accent },
  { emoji: '💬', label: 'Talk', href: '/talk', tint: (c) => c.success },
  // Deliberately not 🔄 — on iOS that's one of Apple's "button" glyphs
  // (like 🔼🔀) with a solid dark square baked into the artwork itself, so
  // it clashed with the tinted circle tile behind it. 🧠 is a plain
  // pictograph like the other three and fits "review" just as well.
  { emoji: '🧠', label: 'Review', href: '/review', tint: () => '#8B6BAE' },
];

/** Four compact shortcuts straight to the other tabs/features — denser than
 * a full card, exactly the "a few quick actions" zone Home is meant to have. */
function QuickActionsRow() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.quickActionsRow}>
      {QUICK_ACTIONS.map((action) => {
        const tint = action.tint(colors);
        return (
          <PressableScale
            key={action.label}
            haptic
            onPress={() => router.push(action.href)}
            style={[styles.quickActionButton, styles.shadowCard]}
          >
            <View style={[styles.quickActionIconTile, { backgroundColor: `${tint}26` }]}>
              <Text style={styles.quickActionEmoji}>{action.emoji}</Text>
            </View>
            <Text style={styles.quickActionLabel}>{action.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A compact, always-4-item checklist of the day's micro-challenges — done
 * items get a check and a strikethrough rather than disappearing, so
 * progress stays visible through the whole day instead of the list
 * shrinking as you go. */
function DailyChallengesCard({ challenges }: { challenges: DailyChallenge[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const completedCount = challenges.filter((c) => c.isComplete).length;
  const allComplete = completedCount === challenges.length;

  return (
    <View style={[styles.recapCard, styles.shadowCard]}>
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

/** The one thing worth doing next: review if anything's due, otherwise the
 * weakest unlocked lesson — a single card with a single reason, replacing
 * what used to be a lesson CTA and a separate review card shown together.
 * For a learner with zero progress anywhere, this becomes their "Start
 * Here" moment instead of generic "pick up where you left off" copy that
 * makes no sense before they've started anything. */
/** One clear entry point to a short guided session (app/todays-practice.tsx).
 * Activities are still browsed and launched individually from the Practice tab. */
function TodaysPracticeCard({ reviewDueCount }: { reviewDueCount: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.todaysPracticeCard, styles.shadowCard]}>
      <Text style={styles.todaysPracticeTitle}>Today’s Practice</Text>
      <Text style={styles.todaysPracticeBody}>
        {reviewDueCount > 0
          ? `${reviewDueCount} ${reviewDueCount === 1 ? 'word' : 'words'} due for review, plus a little new practice.`
          : 'A few minutes of new words and Repeat After Me.'}
      </Text>
      <Button themed label="Start today’s practice" onPress={() => router.push('/todays-practice')} />
    </View>
  );
}

function RecommendedNextCard({
  recommendation,
  isFirstLesson,
}: {
  recommendation: NextStepRecommendation | null;
  isFirstLesson: boolean;
}) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!recommendation) return null;

  const isReview = recommendation.type === 'review';
  const showAsFirstLesson = !isReview && isFirstLesson;

  const title = isReview ? 'Review time' : recommendation.lesson.title ?? recommendation.lesson.unitName;
  const eyebrow = showAsFirstLesson ? 'Your first lesson' : 'Recommended next';
  const emoji = isReview ? '🔄' : showAsFirstLesson ? '🌱' : '📚';
  const reasonText = isReview
    ? `${recommendation.dueCount} ${recommendation.dueCount === 1 ? 'word' : 'words'} due — a quick review keeps them fresh`
    : showAsFirstLesson
      ? "Everyday phrases you'll actually use — no experience needed"
      : recommendation.reason === 'weak_spot'
        ? 'Keep building up an area that needs more practice'
        : 'Pick up right where you left off';

  return (
    <PressableScale
      haptic
      onPress={() => router.push(isReview ? '/review' : `/lesson/${recommendation.lesson.id}`)}
      style={[styles.reviewCard, styles.shadowCard]}
    >
      <LinearGradient
        colors={gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.reviewCardGradient}
      >
        <Text style={styles.reviewEmoji}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.recommendEyebrow}>{eyebrow}</Text>
          <Text style={[styles.reviewTitle, { color: colors.textOnPrimary }]}>{title}</Text>
          <Text style={[styles.reviewSubtitle, { color: colors.textOnPrimary }]}>{reasonText}</Text>
        </View>
        <Text style={[styles.reviewChevron, { color: colors.textOnPrimary }]}>›</Text>
      </LinearGradient>
    </PressableScale>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorEmoji}>😕</Text>
      <Text style={styles.errorTitle}>Couldn&apos;t load your lessons</Text>
      <Text style={styles.errorBody}>Check your connection and try again.</Text>
      <Button themed label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => {
  // Elevation shadows kept theme-independent in shape, since RN shadows
  // read fine on dark surfaces at low opacity too — see the redesign plan.
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
  const shadowRaised = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 };

  return StyleSheet.create({
    shadowCard,
    shadowRaised,
    header: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: radii.lg,
      borderBottomRightRadius: radii.lg,
    },
    greeting: { fontSize: 24, fontWeight: '700', color: colors.textOnPrimary },
    subGreeting: { fontSize: 14, color: colors.textOnPrimary, opacity: 0.85, marginTop: 2 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
    todaysPracticeCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    todaysPracticeTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
    todaysPracticeBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    goalCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
    goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    goalLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    goalHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    streakBadge: { backgroundColor: `${colors.accent}26`, borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.xs },
    streakBadgeText: { fontSize: 13, fontWeight: '700', color: colors.accent },
    goalValue: { fontSize: 14, fontWeight: '700', color: colors.primary },
    goalReachedBanner: {
      backgroundColor: `${colors.success}1F`,
      borderRadius: radii.md,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.sm,
      alignItems: 'center',
    },
    goalReachedText: { fontSize: 13, fontWeight: '700', color: colors.success },
    recapCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.lg },
    recapTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    challengesHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    challengesCount: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    challengesAllDone: { fontSize: 14, fontWeight: '700', color: colors.success, marginTop: spacing.sm },
    challengesList: { marginTop: spacing.sm, gap: spacing.xs },
    challengeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    challengeCheck: { fontSize: 16, width: 22, textAlign: 'center' },
    challengeLabel: { fontSize: 14, color: colors.textPrimary, flex: 1 },
    challengeLabelDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
    quickActionsRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginBottom: spacing.lg },
    quickActionButton: {
      flex: 1,
      minWidth: 0,
      // 'stretch' (not 'center') so the label below is constrained to the
      // button's actual width and wraps/stays centered within it, instead
      // of sizing to its own text width and spilling past the rounded
      // background — which is what was happening with "Review".
      alignItems: 'stretch',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      gap: spacing.xs,
      overflow: 'hidden',
    },
    quickActionIconTile: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionEmoji: { fontSize: 18, lineHeight: 22, textAlign: 'center' },
    quickActionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      width: '100%',
    },
    reviewCard: { borderRadius: radii.lg, marginBottom: spacing.lg, overflow: 'hidden' },
    reviewCardGradient: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    reviewEmoji: { fontSize: 32 },
    recommendEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textOnPrimary,
      opacity: 0.75,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    reviewTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    reviewSubtitle: { fontSize: 13, color: colors.textPrimary, opacity: 0.75, marginTop: 2 },
    reviewChevron: { fontSize: 28, color: colors.textPrimary, opacity: 0.5 },
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
    badgesTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
    badgesRow: { gap: spacing.md, paddingRight: spacing.md },
    badgeItem: { alignItems: 'center', width: 72 },
    badgeCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeCircleEarned: { backgroundColor: colors.accentLight },
    badgeCircleLocked: { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border },
    badgeEmoji: { fontSize: 28 },
    badgeEmojiLocked: { opacity: 0.35 },
    badgeLabel: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    errorEmoji: { fontSize: 48, marginBottom: spacing.sm },
    errorTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    errorBody: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  });
};
