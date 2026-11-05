import { useCallback, useEffect, useState } from 'react';

import { fetchLessonAccessTarget, type LessonAccessTarget } from '@/data/lessonAccess';
import { useAccess } from '@/lib/access/AccessContext';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';

export type LessonAccessStatus = 'checking' | 'open' | 'limit' | 'missing' | 'error';

/**
 * Opens a lesson (or the phrasebook category behind it) through the access
 * layer — counting it on first open — *before* the caller fetches any of its
 * content. Screens load the lesson only once this says 'open'.
 */
export function useLessonAccess(lessonId: string | undefined): {
  status: LessonAccessStatus;
  target: LessonAccessTarget | null;
  retry: () => void;
} {
  const { activeProfile } = useActiveProfile();
  const { isResolved, open } = useAccess();
  const [status, setStatus] = useState<LessonAccessStatus>('checking');
  const [target, setTarget] = useState<LessonAccessTarget | null>(null);
  const [attempt, setAttempt] = useState(0);
  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!profileId || !lessonId || !isResolved) return;
    let cancelled = false;
    setStatus('checking');
    (async () => {
      try {
        const found = await fetchLessonAccessTarget(profileId, lessonId);
        if (cancelled) return;
        if (!found) {
          setStatus('missing');
          return;
        }
        const allowed = await open(found.feature, found.key, { completed: found.completed });
        if (cancelled) return;
        setTarget(found);
        setStatus(allowed ? 'open' : 'limit');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // `open` changes identity when counts change; re-running then would only re-check the same lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, lessonId, isResolved, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, target, retry };
}
