import { useCallback, useEffect, useState } from 'react';

import { fetchLessonMap, fetchPhrasebookCategories } from '@/data/content';
import { useAccess } from '@/lib/access/AccessContext';
import { buildPracticeScope, type PracticeScope } from '@/lib/access/practiceScope';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';

/**
 * The practice scope for the active learner (see practiceScope.ts): Premium →
 * every approved word; otherwise the lessons opened or completed and the
 * phrasebook categories opened. `scope` stays null until loaded — and on an
 * error — so a screen never falls back to an open scope.
 */
export function usePracticeScope(): { scope: PracticeScope | null; error: boolean; reload: () => void } {
  const { activeProfile } = useActiveProfile();
  const { tier, isResolved, decide } = useAccess();
  const [scope, setScope] = useState<PracticeScope | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!profileId || !isResolved) return;
    let cancelled = false;
    setError(false);
    (async () => {
      if (tier === 'premium') {
        setScope(buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }));
        return;
      }
      try {
        const [units, categories] = await Promise.all([fetchLessonMap(profileId), fetchPhrasebookCategories()]);
        if (cancelled) return;
        const openLessons = units
          .flatMap((u) => u.lessons)
          .filter((l) => decide('lesson', l.id, { completed: l.state === 'completed' }) === 'open');
        const openUnitIds = categories
          .filter((c) => decide('phrasebook_category', c.unitId) === 'open')
          .map((c) => c.unitId);
        setScope(buildPracticeScope({ all: false, openLessons, openUnitIds }));
      } catch {
        if (!cancelled) {
          setScope(null);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, isResolved, tier, decide, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { scope, error, reload };
}
