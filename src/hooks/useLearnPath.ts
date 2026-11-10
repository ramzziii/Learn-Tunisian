import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLockedItemAction } from '@/components/access/AccessLimit';
import type { LearnPathData } from '@/components/learn/LearnView';
import { fetchLessonMap } from '@/data/content';
import { fetchProgressSummary, type ProfileProgressSummary } from '@/data/progress';
import { useAccess } from '@/lib/access/AccessContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { buildProgressInsights } from '@/lib/progressInsights';
import type { LessonWithState } from '@/types/models';

/**
 * The learner's path (units, lessons, progress) for Home: loaded on focus,
 * so finishing a lesson elsewhere shows the next one unlocked on return.
 * Lesson order and unlock rules come from fetchLessonMap; a lesson is locked
 * only once the allowance is used up, never one already opened or completed
 * (the same rule /lesson/[lessonId] applies).
 */
export function useLearnPath() {
  const { activeProfile } = useActiveProfile();
  const { decide } = useAccess();
  const onLockedPress = useLockedItemAction();
  const [data, setData] = useState<LearnPathData | null>(null);
  const [loadError, setLoadError] = useState(false);

  const isLessonLocked = useCallback(
    (lesson: LessonWithState) => decide('lesson', lesson.id, { completed: lesson.state === 'completed' }) === 'limit',
    [decide]
  );

  const load = useCallback(async () => {
    if (!activeProfile) return;
    setLoadError(false);
    try {
      const [unitsWithLessons, progressSummary] = await Promise.all([
        fetchLessonMap(activeProfile.id),
        fetchProgressSummary(activeProfile.id).catch(
          () => ({ wordsLearning: 0, wordsMastered: 0, wordsReviewed: 0, totalWordsSeen: 0 }) satisfies ProfileProgressSummary
        ),
      ]);
      const allLessons = unitsWithLessons.flatMap((u) => u.lessons);
      setData({ unitsWithLessons, progressSummary, progressInsights: buildProgressInsights(allLessons) });
    } catch {
      setLoadError(true);
    }
  }, [activeProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { data, loadError, reload: load, isLessonLocked, onLockedPress };
}
