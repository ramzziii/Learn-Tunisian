import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { fetchLessonMap } from '@/data/content';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { fetchReviewDueCount } from '@/data/progress';
import { fetchMinutesLearnedToday } from '@/data/sessionLogs';
import { useAccess } from '@/lib/access/AccessContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { DailyGoalMinutes } from '@/types/models';

interface HomeData {
  reviewDueCount: number;
  minutesToday: number;
  goalMinutes: DailyGoalMinutes;
}

/**
 * Home answers one question — "what should I do now?" — with one primary
 * action: Start today's practice (app/todays-practice.tsx). Below it, only
 * when words are due, a quiet "N words due" link to Review. Greeting and
 * today's minutes toward the daily goal stay; lessons live on Learn and
 * individual activities on Practice.
 *
 * Today's Practice works for a brand-new learner too: it takes new words
 * from the one unlocked lesson (lessons unlock in order, so there is only
 * ever one) — for a new learner the first lesson, which it opens (counted)
 * while the allowance has room. So there is no separate "start your first
 * lesson" fallback here — if that lesson had no words, a lesson session would have
 * none either, and Today's Practice's own empty state points to Practice.
 *
 * The daily-challenge checklist and the day count are no longer shown here;
 * their stored data and calculations (src/lib/dailyChallenges.ts,
 * dailyChallengeProgress.ts, streak.ts) are left in place.
 */
export default function Home() {
  const { tier } = useAccess();
  if (tier === 'guest') return <GuestHome />;
  return <AccountHome />;
}

/**
 * The guest preview's Home: no goal or streak (nothing is saved to an
 * account), one action — try the first preview lesson — and a quiet way to
 * create a free account.
 */
function GuestHome() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [firstLessonId, setFirstLessonId] = useState<string | null>(null);

  useEffect(() => {
    fetchLessonMap('guest')
      .then((units) => setFirstLessonId(units.flatMap((u) => u.lessons)[0]?.id ?? null))
      .catch(() => setFirstLessonId(null));
  }, []);

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <HomeHeader name="there" subtitle="You’re trying the free preview." />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Reveal style={styles.primaryAction}>
          <Button
            themed
            label="Try lesson 1"
            onPress={() => router.push(firstLessonId ? `/lesson/${firstLessonId}` : '/learn')}
          />
        </Reveal>
        <Reveal delay={80}>
          <Text style={styles.guestNote}>
            A free account keeps your progress and opens a few more lessons, phrases, notes and letters.
          </Text>
          <Button themed label="Create a free account" variant="ghost" onPress={() => router.push('/onboarding/age')} />
        </Reveal>
      </ScrollView>
    </ScreenContainer>
  );
}

function AccountHome() {
  const { activeProfile } = useActiveProfile();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<HomeData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    // Each falls back to a sensible default — none of them should take the
    // whole screen down, and the primary action works without any of them.
    const [reviewDueCount, minutesToday, goalSettings] = await Promise.all([
      fetchReviewDueCount(activeProfile.id).catch(() => 0),
      fetchMinutesLearnedToday(activeProfile.id).catch(() => 0),
      fetchDailyGoalSettings(activeProfile.id).catch(() => null),
    ]);
    setData({ reviewDueCount, minutesToday, goalMinutes: goalSettings?.dailyGoalMinutes ?? 5 });
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

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <HomeHeader name={activeProfile.name} />

      {data === null ? (
        <LoadingScreen themed />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <HomeContent data={data} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function HomeHeader({ name, subtitle = 'Ready for today’s practice?' }: { name: string; subtitle?: string }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <Text style={styles.greeting}>Ahla, {name}!</Text>
      <Text style={styles.subGreeting}>{subtitle}</Text>
    </LinearGradient>
  );
}

/** Today's minutes toward the goal, the one primary action, and — only when
 * something is due — a quiet link to Review. */
function HomeContent({ data }: { data: HomeData }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { reviewDueCount, minutesToday, goalMinutes } = data;

  const goalProgress = goalMinutes > 0 ? minutesToday / goalMinutes : 0;
  const goalReached = minutesToday >= goalMinutes;
  const dueLabel = `${reviewDueCount} ${reviewDueCount === 1 ? 'word' : 'words'} due`;

  return (
    <>
      <Reveal delay={0}>
        <View style={[styles.goalCard, styles.shadowCard]}>
          <View style={styles.goalHeaderRow}>
            <Text style={styles.goalLabel}>Today&apos;s goal</Text>
            <Text style={styles.goalValue}>
              {minutesToday} / {goalMinutes} min
            </Text>
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
        <View style={[styles.todaysPracticeCard, styles.shadowCard]}>
          <Text style={styles.todaysPracticeTitle}>Today’s Practice</Text>
          <Text style={styles.todaysPracticeBody}>
            A few minutes picked for you: words to review, a little new vocabulary and Repeat After Me.
          </Text>
          <Button themed label="Start today’s practice" onPress={() => router.push('/todays-practice')} />
        </View>
      </Reveal>

      {reviewDueCount > 0 ? (
        <Reveal delay={30}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${dueLabel}. Open Review`}
            onPress={() => router.push('/review')}
            hitSlop={8}
            style={({ pressed }) => [styles.dueLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.dueLinkText}>{dueLabel}</Text>
            <Text style={styles.dueLinkAction}>Review ›</Text>
          </Pressable>
        </Reveal>
      ) : null}
    </>
  );
}

const makeStyles = (colors: ThemeColors) => {
  // Elevation shadows kept theme-independent in shape, since RN shadows
  // read fine on dark surfaces at low opacity too — see the redesign plan.
  const shadowCard = { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

  return StyleSheet.create({
    shadowCard,
    header: {
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: radii.lg,
      borderBottomRightRadius: radii.lg,
    },
    greeting: { fontSize: 24, fontWeight: '700', color: colors.textOnPrimary },
    subGreeting: { fontSize: 14, color: colors.textOnPrimary, opacity: 0.85, marginTop: 2 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
    primaryAction: { marginBottom: spacing.lg },
    guestNote: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xs },
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
    dueLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    dueLinkText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    dueLinkAction: { fontSize: 15, fontWeight: '700', color: colors.primary },
  });
};
