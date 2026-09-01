import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SessionRunner } from '@/components/session/SessionRunner';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, spacing } from '@/constants/theme';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { fetchReviewQueue } from '@/data/progress';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

export default function ReviewSession() {
  const { activeProfile } = useActiveProfile();
  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    let cancelled = false;
    (async () => {
      const [dueGroups, dailyGoal] = await Promise.all([
        fetchReviewQueue(activeProfile.id),
        fetchDailyGoalSettings(activeProfile.id),
      ]);
      if (cancelled) return;
      setGroups(dueGroups);
      setGoalMinutes(dailyGoal?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES);
      setIsReady(true);
      prefetchLessonAudio(dueGroups.flatMap((g) => g.variants));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile]);

  if (!isReady || !groups || !activeProfile) return <LoadingScreen />;

  if (groups.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌿</Text>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>Nothing is due for review right now — nice work staying on top of it.</Text>
          <Button label="Back to home" variant="secondary" onPress={() => router.replace('/home')} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile.id}
      track={activeProfile.track}
      sessionType="review"
      emptyMessage="Nothing is due for review right now."
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
});
