import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(profileId: string): string {
  return `learn-tunisian.seen-badges.${profileId}`;
}

/**
 * Badge earned/not-earned is always recomputed live (see src/lib/badges.ts)
 * — the only thing actually persisted is which badge ids this profile has
 * already had its "new badge!" celebration for, so it only plays once.
 * Local-only (AsyncStorage), same pattern as src/lib/alphabetProgress.ts.
 */
export async function getSeenBadgeIds(profileId: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(storageKey(profileId));
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export async function markBadgesSeen(profileId: string, badgeIds: string[]): Promise<void> {
  const current = await getSeenBadgeIds(profileId);
  const merged = Array.from(new Set([...current, ...badgeIds]));
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(merged));
}
