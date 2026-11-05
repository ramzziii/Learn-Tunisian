import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AccessCheckProblem } from '@/components/access/AccessLimit';
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
import { filterToPracticeScope } from '@/lib/access/practiceScope';
import { usePracticeScope } from '@/lib/access/usePracticeScope';
import { markReviewCompletedToday } from '@/lib/dailyChallengeProgress';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

export default function ReviewSession() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);
  const [isReady, setIsReady] = useState(false);
  // Practice isn't counted: the queue only holds approved words from lessons /
  // categories the learner has open (every approved word with Premium).
  const { scope, error: scopeError, reload } = usePracticeScope();

  useEffect(() => {
    if (!activeProfile || !scope) return;
    let cancelled = false;
    (async () => {
      const [dueGroups, dailyGoal] = await Promise.all([
        fetchReviewQueue(activeProfile.id),
        fetchDailyGoalSettings(activeProfile.id),
      ]);
      if (cancelled) return;
      const inScope = filterToPracticeScope(scope, dueGroups);
      setGroups(inScope);
      setGoalMinutes(dailyGoal?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES);
      setIsReady(true);
      prefetchLessonAudio(inScope.flatMap((g) => g.variants));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile, scope]);

  if (scopeError) return <AccessCheckProblem kind="error" onRetry={reload} />;

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
