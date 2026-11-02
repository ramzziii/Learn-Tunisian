import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { AccessCheckProblem, AccessLimitScreen } from '@/components/access/AccessLimit';
import { SessionRunner } from '@/components/session/SessionRunner';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { fetchWordGroupsForLesson } from '@/data/content';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAccess } from '@/lib/access/AccessContext';
import { useLessonAccess } from '@/lib/access/useLessonAccess';
import { takeGuestNudge } from '@/lib/guest/nudge';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

export default function LessonSession() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { activeProfile } = useActiveProfile();
  // Opened (and counted on first open) before any of its content is fetched,
  // so a direct link past the allowance never starts the lesson.
  const access = useLessonAccess(lessonId);
  const { tier } = useAccess();

  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!activeProfile || !lessonId || access.status !== 'open') return;
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
  }, [activeProfile, lessonId, access.status]);

  if (access.status === 'limit') return <AccessLimitScreen feature={access.target?.feature ?? 'lesson'} />;
  if (access.status === 'missing' || access.status === 'error') {
    return <AccessCheckProblem kind={access.status} onRetry={access.retry} />;
  }

  if (!isReady || !groups || !activeProfile) return <LoadingScreen themed />;

  return (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile.id}
      sessionType="lesson"
      emptyMessage="This lesson doesn't have any words yet."
      currentLessonId={lessonId}
      // A guest who finishes a lesson gets the gentle nudge (once per launch, never blocking).
      onComplete={() => {
        if (tier === 'guest' && takeGuestNudge()) {
          router.push({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
        }
      }}
    />
  );
}
