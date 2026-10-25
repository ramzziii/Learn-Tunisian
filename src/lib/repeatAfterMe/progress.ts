import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RamItemResult, RamSavedItemProgress } from '@/lib/repeatAfterMe/session';

/**
 * Repeat After Me progress: local, per-profile (AsyncStorage) — the same
 * pattern as phrasebookProgress/alphabetProgress, the closest existing
 * features. Kept out of the `progress` table on purpose: these are
 * self-assessed results, and feeding them into spaced repetition would change
 * the main Review queue. Only counts and results are stored — never audio,
 * file paths, or recording URIs.
 */
export interface RepeatAfterMeProgress {
  items: Record<string, RamSavedItemProgress>;
  sessionsCompleted: number;
  lastCompletedAt: string | null;
}

const EMPTY: RepeatAfterMeProgress = { items: {}, sessionsCompleted: 0, lastCompletedAt: null };

function storageKey(profileId: string): string {
  return `learn-tunisian.repeat-after-me-progress.${profileId}`;
}

export async function getRepeatAfterMeProgress(profileId: string): Promise<RepeatAfterMeProgress> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(profileId));
    if (!raw) return { ...EMPTY, items: {} };
    const parsed = JSON.parse(raw) as Partial<RepeatAfterMeProgress>;
    return {
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
      sessionsCompleted: typeof parsed.sessionsCompleted === 'number' ? parsed.sessionsCompleted : 0,
      lastCompletedAt: typeof parsed.lastCompletedAt === 'string' ? parsed.lastCompletedAt : null,
    };
  } catch {
    return { ...EMPTY, items: {} };
  }
}

async function save(profileId: string, data: RepeatAfterMeProgress): Promise<void> {
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(data));
}

/** Records one pass over an item (its attempts in that pass and the result). */
export async function recordRepeatAfterMeItemResult(
  profileId: string,
  variantId: string,
  outcome: RamItemResult
): Promise<void> {
  const current = await getRepeatAfterMeProgress(profileId);
  const previous = current.items[variantId];
  current.items[variantId] = {
    attempts: (previous?.attempts ?? 0) + outcome.attempts,
    lastResult: outcome.result,
    lastPracticedAt: new Date().toISOString(),
  };
  await save(profileId, current);
}

export async function markRepeatAfterMeSessionCompleted(profileId: string): Promise<void> {
  const current = await getRepeatAfterMeProgress(profileId);
  await save(profileId, {
    ...current,
    sessionsCompleted: current.sessionsCompleted + 1,
    lastCompletedAt: new Date().toISOString(),
  });
}
