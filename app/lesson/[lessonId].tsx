import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { SessionRunner } from '@/components/session/SessionRunner';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { fetchWordGroupsForLesson } from '@/data/content';
import { fetchDailyGoalSettings } from '@/data/profiles';
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
      prefetchLessonAudio(lessonGroups.flatMap((g) => g.variants));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile, lessonId]);

  if (!isReady || !groups || !activeProfile) return <LoadingScreen />;

  return (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile.id}
      track={activeProfile.track}
      sessionType="lesson"
      emptyMessage="This lesson doesn't have any words yet."
    />
  );
}
