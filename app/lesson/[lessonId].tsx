import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { PremiumGate } from '@/components/premium/Premium';
import { SessionRunner } from '@/components/session/SessionRunner';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { fetchAccessibleLessonWordGroups } from '@/data/premiumAccess';
import { fetchDailyGoalSettings } from '@/data/profiles';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { prefetchLessonAudio } from '@/lib/offline/audioCache';
import { PremiumRequiredError } from '@/lib/premium/access';
import type { DailyGoalMinutes, WordGroupWithVariants } from '@/types/models';

const DEFAULT_GOAL_MINUTES: DailyGoalMinutes = 5;

export default function LessonSession() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { activeProfile } = useActiveProfile();

  const [groups, setGroups] = useState<WordGroupWithVariants[] | null>(null);
  const [goalMinutes, setGoalMinutes] = useState<DailyGoalMinutes>(DEFAULT_GOAL_MINUTES);
  const [isReady, setIsReady] = useState(false);
  const [isPremiumLocked, setIsPremiumLocked] = useState(false);

  useEffect(() => {
    if (!activeProfile || !lessonId) return;
    let cancelled = false;
    (async () => {
      let lessonGroups: WordGroupWithVariants[];
      let dailyGoal: Awaited<ReturnType<typeof fetchDailyGoalSettings>>;
      try {
        // Access is checked before any of the lesson's content is fetched,
        // so a direct link to a locked lesson never starts it.
        [lessonGroups, dailyGoal] = await Promise.all([
          fetchAccessibleLessonWordGroups(lessonId, activeProfile.isPremium),
          fetchDailyGoalSettings(activeProfile.id),
        ]);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PremiumRequiredError) {
          setIsPremiumLocked(true);
          return;
        }
        throw error;
      }
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

  if (isPremiumLocked) {
    return (
      <PremiumGate
        title="This lesson is part of Premium"
        message="Your free plan includes the first lesson and the Greetings phrasebook. Upgrade to unlock every lesson."
      />
    );
  }

  if (!isReady || !groups || !activeProfile) return <LoadingScreen themed />;

  return (
    <SessionRunner
      groups={groups}
      goalMinutes={goalMinutes}
      profileId={activeProfile.id}
      track={activeProfile.track}
      sessionType="lesson"
      emptyMessage="This lesson doesn't have any words yet."
      currentLessonId={lessonId}
    />
  );
}
