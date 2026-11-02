import { useEffect, useState } from 'react';

import { itemAllowance } from '@/lib/access/accessRules';
import { useAccess } from '@/lib/access/AccessContext';
import { ARABIC_LETTERS, type ArabicLetter } from '@/lib/alphabet';

export type LetterPoolStatus = 'checking' | 'ready' | 'limit' | 'error';

/**
 * The letters an alphabet activity (practice round, Speed Match) may use.
 * Premium: every letter. Otherwise the letters already opened; if there are
 * fewer than `min`, the next ones in teaching order are opened (each counted)
 * — but only when the allowance can reach `min`, so a guest who can't play
 * Speed Match never uses letters on it. Resolved once, when the activity starts.
 */
export function useOpenLetterPool(min: number): { status: LetterPoolStatus; letters: ArabicLetter[] } {
  const { tier, isResolved, decide, claimed, open } = useAccess();
  const [state, setState] = useState<{ status: LetterPoolStatus; letters: ArabicLetter[] }>({
    status: 'checking',
    letters: [],
  });

  useEffect(() => {
    if (!isResolved) return;
    let cancelled = false;
    (async () => {
      if (tier === 'premium') {
        setState({ status: 'ready', letters: [...ARABIC_LETTERS] });
        return;
      }
      const isOpen = (l: ArabicLetter) => decide('alphabet_letter', l.id) === 'open';
      const pool = ARABIC_LETTERS.filter(isOpen);
      const remaining = Math.max(0, itemAllowance(tier) - claimed('alphabet_letter').size);
      if (pool.length + remaining < min) {
        setState({ status: 'limit', letters: pool });
        return;
      }
      try {
        for (const letter of ARABIC_LETTERS) {
          if (pool.length >= min) break;
          if (isOpen(letter)) continue;
          if (!(await open('alphabet_letter', letter.id))) break;
          pool.push(letter);
        }
      } catch {
        if (!cancelled) setState({ status: 'error', letters: [] });
        return;
      }
      if (!cancelled) setState({ status: pool.length >= min ? 'ready' : 'limit', letters: pool });
    })();
    return () => {
      cancelled = true;
    };
    // Resolved once per activity start; counts changing as letters open must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResolved, tier, min]);

  return state;
}
