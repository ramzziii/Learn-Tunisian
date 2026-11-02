import { useCallback, useEffect, useState } from 'react';

import { fetchSearchableWordGroups } from '@/data/search';
import { useAccess } from '@/lib/access/AccessContext';
import type { PracticeScope } from '@/lib/access/practiceScope';
import { usePracticeScope } from '@/lib/access/usePracticeScope';
import { useAuth } from '@/lib/auth/AuthContext';
import { buildSearchIndex, type SearchIndex } from '@/lib/search/searchIndex';
import { readSearchIndex, storeSearchIndex } from '@/lib/search/searchIndexCache';

export type SearchIndexStatus = 'loading' | 'ready' | 'offline';

function scopeSignature(scope: PracticeScope): string {
  if (scope.all) return 'all';
  return [[...scope.lessonKeys].sort().join(','), [...scope.unitIds].sort().join(',')].join('|');
}

/**
 * The dictionary index for the current learner, built from the
 * access-filtered loader (src/data/search.ts) and kept in memory only. The
 * key changes — and the index is rebuilt — on sign-in / sign-out, Premium
 * refresh, the admin preview toggle (tier), guest carry-over (account), and
 * when the learner opens new lessons or categories (scope).
 */
export function useSearchIndex(): { status: SearchIndexStatus; index: SearchIndex | null; retry: () => void } {
  const { session } = useAuth();
  const { tier, isResolved } = useAccess();
  const { scope, error: scopeError, reload } = usePracticeScope();
  const [attempt, setAttempt] = useState(0);

  // A guest searches the whole preview, whatever they've opened.
  const key = scope
    ? `${session?.user.id ?? 'guest'}|${tier}|${tier === 'guest' ? 'preview' : scopeSignature(scope)}`
    : null;
  const [state, setState] = useState<{ key: string | null; status: SearchIndexStatus; index: SearchIndex | null }>(() => {
    const index = key ? readSearchIndex(key) : null;
    return { key, status: index ? 'ready' : 'loading', index };
  });

  useEffect(() => {
    if (scopeError) {
      setState({ key: null, status: 'offline', index: null });
      return;
    }
    if (!isResolved || !scope || !key) return;
    const cachedIndex = readSearchIndex(key);
    if (cachedIndex) {
      setState({ key, status: 'ready', index: cachedIndex });
      return;
    }
    let cancelled = false;
    setState({ key, status: 'loading', index: null });
    fetchSearchableWordGroups(scope)
      .then((words) => {
        if (cancelled) return;
        const index = buildSearchIndex(words);
        storeSearchIndex(key, index);
        setState({ key, status: 'ready', index });
      })
      .catch(() => {
        if (!cancelled) setState({ key, status: 'offline', index: null });
      });
    return () => {
      cancelled = true;
    };
    // `scope` is captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isResolved, scopeError, attempt]);

  const retry = useCallback(() => {
    if (scopeError) reload();
    setAttempt((n) => n + 1);
  }, [scopeError, reload]);

  // Never hand out an index built for another key.
  const current = state.key === key ? state : { status: 'loading' as const, index: null };
  return { status: scopeError ? 'offline' : current.status, index: current.index, retry };
}
