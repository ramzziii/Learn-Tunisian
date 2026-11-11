import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GrowingBar } from '@/components/lesson-map/GrowingBar';
import { HeaderBadge, LearnPath, PageHeader } from '@/components/learn/LearnView';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, shadows, spacing, type ThemeColors } from '@/constants/theme';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { fetchReviewDueCount } from '@/data/progress';
import { fetchMinutesLearnedToday } from '@/data/sessionLogs';
import { useLearnPath } from '@/hooks/useLearnPath';
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
 * Home, in the same style as Learn: a big greeting with today's minutes
 * toward the goal, one primary action — Start today's practice
 * (app/todays-practice.tsx) — a "N words due" link to Review only when
 * words are due, and then the learner's path: progress, the Continue card,
 * and Your units (LearnPath). Reference features live on Learn.
 *
 * Today's Practice works for a brand-new learner too: it takes new words
 * from the one unlocked lesson, so there is no separate "start your first
 * lesson" button — the path's own "Start your first lesson" card is there.
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

/** The learner's path under everything else, with its own loading/error. */
function PathBlock({ path, baseDelay }: { path: ReturnType<typeof useLearnPath>; baseDelay: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (path.data) {
    return <LearnPath data={path.data} isLessonLocked={path.isLessonLocked} onLockedPress={path.onLockedPress} baseDelay={baseDelay} />;
  }
  if (path.loadError) {
    return (
      <View style={styles.pathError}>
        <Text style={styles.pathErrorText}>Couldn&apos;t load your lessons</Text>
        <Button themed label="Try again" variant="secondary" onPress={path.reload} />
      </View>
    );
  }
  return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />;
}

/**
 * The guest preview's Home: no goal (nothing is saved to an account), the
 * path — whose "Start your first lesson" card opens preview lesson 1 — and a
 * quiet way to create a free account.
 */
function GuestHome() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const path = useLearnPath();

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Reveal delay={0}>
          <PageHeader eyebrow="Free preview" title="Ahla!" subtitle="You’re trying the free preview." />
        </Reveal>
        <View style={styles.body}>
          <Reveal delay={60}>
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.guestNote}>
                A free account keeps your progress and opens a few more lessons, phrases, notes and letters.
              </Text>
              <Button themed label="Create a free account" variant="secondary" onPress={() => router.push('/onboarding/age')} />
            </View>
          </Reveal>
          <PathBlock path={path} baseDelay={120} />
        </View>
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
  const path = useLearnPath();

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

  // A different profile starts from a blank screen; coming back to the tab
  // refreshes in place (minutes and due words change after practice).
  useEffect(() => setData(null), [activeProfile?.id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([load(), path.reload()]);
    setIsRefreshing(false);
  };

  if (!activeProfile) return <LoadingScreen themed />;
  if (data === null) {
    return (
      <ScreenContainer themed style={{ padding: 0 }}>
        <PageHeader eyebrow="Today" title={`Ahla, ${activeProfile.name}!`} subtitle="Ready for today’s practice?" />
        <LoadingScreen themed />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer themed style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <HomeContent name={activeProfile.name} data={data} />
        <View style={styles.body}>
          <PathBlock path={path} baseDelay={120} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

/** Greeting with today's minutes, the one primary action, and — only when
 * something is due — a link to Review. */
function HomeContent({ name, data }: { name: string; data: HomeData }) {
  const { colors, gradients } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { reviewDueCount, minutesToday, goalMinutes } = data;

  const goalProgress = goalMinutes > 0 ? Math.min(minutesToday / goalMinutes, 1) : 0;
  const goalReached = minutesToday >= goalMinutes;
  const dueLabel = `${reviewDueCount} ${reviewDueCount === 1 ? 'word' : 'words'} due`;

  return (
    <>
      <Reveal delay={0}>
        <PageHeader
          eyebrow="Today"
          title={`Ahla, ${name}!`}
          subtitle="Ready for today’s practice?"
          right={<HeaderBadge value={`${minutesToday}/${goalMinutes}`} label="min" success={goalReached} />}
        >
          <Text style={styles.goalText}>
            Today&apos;s goal: {minutesToday} / {goalMinutes} min
          </Text>
          <GrowingBar
            progress={goalProgress}
            colors={goalReached ? gradients.success : gradients.celebration}
            trackColor={colors.border}
            height={8}
            delay={200}
            style={{ marginTop: spacing.sm }}
          />
          {goalReached ? (
            <View style={styles.goalReachedPill}>
              <Text style={styles.goalReachedText}>🎉 Goal reached — nice work today!</Text>
            </View>
          ) : null}
        </PageHeader>
      </Reveal>

      <View style={styles.body}>
        <Reveal delay={40}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.cardTop}>
              <View style={[styles.tileIcon, { backgroundColor: `${colors.primary}1F` }]}>
                <Text style={styles.tileEmoji}>✨</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Today’s Practice</Text>
                <Text style={styles.cardBody}>
                  A few minutes picked for you: words to review, a little new vocabulary and Repeat After Me.
                </Text>
              </View>
            </View>
            <Button themed label="Start today’s practice" onPress={() => router.push('/todays-practice')} />
          </View>
        </Reveal>

        {reviewDueCount > 0 ? (
          <Reveal delay={80}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${dueLabel}. Open Review`}
              onPress={() => router.push('/review')}
              hitSlop={8}
              style={({ pressed }) => [styles.dueRow, shadows.card, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.tileIcon, { backgroundColor: `${colors.accent}2E` }]}>
                <Text style={styles.tileEmoji}>🔁</Text>
              </View>
              <Text style={styles.dueText}>{dueLabel}</Text>
              <Text style={styles.dueAction}>Review ›</Text>
            </Pressable>
          </Reveal>
        ) : null}
      </View>
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrollContent: { paddingBottom: spacing.xxl },
    body: { paddingHorizontal: spacing.lg },
    goalText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: spacing.md },
    goalReachedPill: {
      alignSelf: 'flex-start',
      backgroundColor: `${colors.success}1F`,
      borderRadius: radii.pill,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.sm,
    },
    goalReachedText: { fontSize: 13, fontWeight: '700', color: colors.success },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    tileIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    tileEmoji: { fontSize: 22 },
    cardTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
    cardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: 2 },
    guestNote: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    dueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    dueText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    dueAction: { fontSize: 15, fontWeight: '700', color: colors.primary },
    pathError: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
    pathErrorText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  });
