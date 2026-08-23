import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExerciseRenderer } from '@/components/exercises/shared/ExerciseRenderer';
import { SessionCompleteCard } from '@/components/session/SessionCompleteCard';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, spacing } from '@/constants/theme';
import { fetchWordGroupsForLesson } from '@/data/content';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { recordWordGroupResult } from '@/data/progress';
import { useExerciseQueue } from '@/hooks/useExerciseQueue';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

export default function LessonSession() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { activeProfile } = useActiveProfile();

  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!activeProfile || !lessonId) return;
    let cancelled = false;
    (async () => {
      const [lessonGroups, dailyGoal] = await Promise.all([
        fetchWordGroupsForLesson(lessonId),
        fetchDailyGoalSettings(activeProfile.id),
      ]);
      if (cancelled) return;
      setGroups(lessonGroups);
      setGoalMinutes(dailyGoal?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES);
      setIsReady(true);
      // Prefetch every variant's audio (not just each group's prompt), since
      // the "you might also hear" / gender-pair callouts reference them too.
      prefetchLessonAudio(lessonGroups.flatMap((g) => g.variants));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile, lessonId]);

  return isReady && groups ? (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile!.id}
      track={activeProfile!.track}
    />
  ) : (
    <LoadingScreen />
  );
}

function SessionRunner({
  groups,
  goalMinutes,
  profileId,
  track,
}: {
  groups: WordGroupWithVariants[];
  goalMinutes: DailyGoalMinutes;
  profileId: string;
  track: 'kid' | 'adult';
}) {
  const timer = useSessionTimer(goalMinutes);
  const { currentExercise, next } = useExerciseQueue(groups, track);

  const handleAnswer = (wasCorrect: boolean) => {
    if (!currentExercise) return;
    recordWordGroupResult(profileId, currentExercise.targetGroup.id, wasCorrect).catch(() => {
      // Progress is best-effort in v1; a failed write shouldn't block the session.
    });
    next();
  };

  if (groups.length === 0) {
    return (
      <ScreenContainer>
        <Text style={styles.emptyText}>This lesson doesn&apos;t have any words yet.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Exit lesson" style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar progress={timer.goalSeconds > 0 ? timer.elapsedSeconds / timer.goalSeconds : 0} />
        </View>
      </View>

      {currentExercise ? <ExerciseRenderer exercise={currentExercise} onComplete={handleAnswer} /> : <LoadingScreen />}

      {timer.isComplete ? (
        <SessionCompleteCard
          minutesLearned={Math.max(1, Math.round(timer.goalSeconds / 60))}
          onClose={() => router.replace('/home')}
          onAddMore={(minutes) => timer.addMinutes(minutes)}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 18, color: colors.textSecondary },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
});
