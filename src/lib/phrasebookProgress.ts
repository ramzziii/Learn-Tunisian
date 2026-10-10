import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(profileId: string): string {
  return `learn-tunisian.phrasebook-progress.${profileId}`;
}

/**
 * Phrasebook "viewed" tracking is local-only, per-profile (AsyncStorage), not
 * a Supabase table — same reasoning as proverbProgress.ts/alphabetProgress.ts:
 * a lightweight "have you opened this phrase yet" signal for the list/grid,
 * separate from the real spaced-repetition mastery tracking that happens via
 * the `progress` table once a phrase is actually practiced as a lesson.
 */
export async function getViewedPhraseIds(profileId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(storageKey(profileId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function markPhraseViewed(profileId: string, phraseId: string): Promise<string[]> {
  const current = await getViewedPhraseIds(profileId);
  if (current.includes(phraseId)) return current;
  const next = [...current, phraseId];
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(next));
  return next;
}
