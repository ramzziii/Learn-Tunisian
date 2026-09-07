import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(profileId: string): string {
  return `learn-tunisian.proverb-progress.${profileId}`;
}

/**
 * Culture Corner progress is local-only, per-profile (AsyncStorage), not a
 * Supabase table — same reasoning as alphabetProgress.ts: a lightweight
 * "have you opened this one yet" signal for the grid, not spaced-repetition
 * mastery tracking.
 */
export async function getViewedProverbIds(profileId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(storageKey(profileId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function markProverbViewed(profileId: string, proverbId: string): Promise<string[]> {
  const current = await getViewedProverbIds(profileId);
  if (current.includes(proverbId)) return current;
  const next = [...current, proverbId];
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(next));
  return next;
}
