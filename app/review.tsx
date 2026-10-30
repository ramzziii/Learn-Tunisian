import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PremiumGate } from '@/components/premium/Premium';
import { SessionRunner } from '@/components/session/SessionRunner';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Reveal } from '@/components/ui/Reveal';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { fetchReviewQueue } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { usePremium } from '@/lib/premium/PremiumContext';
import { markReviewCompletedToday } from '@/lib/dailyChallengeProgress';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import { canStartReview, FREE_REVIEW_WORD_LIMIT, limitReviewQueue } from '@/lib/premium/access';
import { hasUsedFreeReviewToday, markFreeReviewStarted } from '@/lib/premium/freeAllowance';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

export default function ReviewSession() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);
  const [isReady, setIsReady] = useState(false);
  const [isAllowanceUsed, setIsAllowanceUsed] = useState(false);
  // Premium starts straight away (unchanged behavior); a free session waits
  // for an explicit Start on a screen that states the allowance first.
  const [hasStarted, setHasStarted] = useState(false);
  const { isPremium, isResolved } = usePremium();

  useEffect(() => {
    if (!activeProfile || !isResolved) return;
    let cancelled = false;
    setIsAllowanceUsed(false);
    (async () => {
      // Decided before the queue is even fetched — never mid-session.
      if (!canStartReview(isPremium, await hasUsedFreeReviewToday(activeProfile.id))) {
        if (!cancelled) setIsAllowanceUsed(true);
        return;
      }
      const [dueGroups, dailyGoal] = await Promise.all([
        fetchReviewQueue(activeProfile.id),
        fetchDailyGoalSettings(activeProfile.id),
      ]);
      if (cancelled) return;
      setGroups(limitReviewQueue(isPremium, dueGroups));
      setHasStarted(isPremium);
      setGoalMinutes(dailyGoal?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES);
      setIsReady(true);
      prefetchLessonAudio(dueGroups.flatMap((g) => g.variants));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile, isPremium, isResolved]);

  if (isAllowanceUsed) {
    return (
      <PremiumGate
        title="You've used today's free review"
        message={`The free plan includes one review a day (up to ${FREE_REVIEW_WORD_LIMIT} words). Come back tomorrow, or upgrade for unlimited review.`}
      />
    );
  }

  if (!isReady || !groups || !activeProfile) return <LoadingScreen themed />;

  if (groups.length === 0) {
    // Review and speaking are the same "keep it fresh" loop — with nothing
    // due, speaking practice is the natural next thing to point to, instead
    // of a dead end.
    return (
      <ScreenContainer themed>
        <Reveal style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌿</Text>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>Nothing is due for review right now — nice work staying on top of it.</Text>
          <Button themed label="Practice speaking instead" onPress={() => router.replace('/speaking-practice')} />
          <Button themed
            label="Back to home"
            variant="ghost"
            onPress={() => router.replace('/home')}
          />
        </Reveal>
      </ScreenContainer>
    );
  }

  if (!hasStarted) {
    return (
      <ScreenContainer themed>
        <Reveal style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔄</Text>
          <Text style={styles.emptyTitle}>Today&apos;s free review</Text>
          <Text style={styles.emptyBody}>
            {groups.length} {groups.length === 1 ? 'word' : 'words'} ready. The free plan includes one review a day, up
            to {FREE_REVIEW_WORD_LIMIT} words — Premium removes the limit.
          </Text>
          <Button
            themed
            label="Start review"
            onPress={() => {
              markFreeReviewStarted(activeProfile.id);
              setHasStarted(true);
            }}
          />
          <Button themed label="Not now" variant="ghost" onPress={() => router.back()} />
        </Reveal>
      </ScreenContainer>
    );
  }

  return (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile.id}
      sessionType="review"
      emptyMessage="Nothing is due for review right now."
      onComplete={() => markReviewCompletedToday(activeProfile.id)}
    />
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emptyEmoji: { fontSize: 56, marginBottom: spacing.sm },
    emptyTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  });
