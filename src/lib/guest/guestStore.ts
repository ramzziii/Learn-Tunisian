import AsyncStorage from '@react-native-async-storage/async-storage';

import { GUEST_ITEM_ALLOWANCE, isServerCounted, type CountedFeature } from '@/lib/access/accessRules';
import { GUEST_DATA_STORAGE_KEY } from '@/lib/localStorageKeys';

/**
 * The guest preview's data — on this device only, never sent anywhere while
 * signed out. At sign-up, the used items are recorded on the new account (so
 * signing up doesn't reset the allowance) and, with the learner's consent,
 * results and favorites are brought into the new profile; then it's cleared.
 */
export interface GuestData {
  /** Items used per counted feature (at most GUEST_ITEM_ALLOWANCE each). */
  claims: Partial<Record<CountedFeature, string[]>>;
  /** Practice results per word group id. */
  results: Record<string, { correct: number; incorrect: number; lastSeenAt: string }>;
  /** Starred word group ids. */
  favorites: string[];
}

const empty = (): GuestData => ({ claims: {}, results: {}, favorites: [] });

export async function getGuestData(): Promise<GuestData> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_DATA_STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<GuestData>;
    return {
      claims: parsed.claims && typeof parsed.claims === 'object' ? parsed.claims : {},
      results: parsed.results && typeof parsed.results === 'object' ? parsed.results : {},
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch {
    return empty();
  }
}

async function save(data: GuestData): Promise<void> {
  await AsyncStorage.setItem(GUEST_DATA_STORAGE_KEY, JSON.stringify(data));
}

/** Uses one guest item (true), or reports the allowance is used up (false). An item already used is always true. */
export async function claimGuestItem(feature: CountedFeature, itemKey: string): Promise<boolean> {
  const data = await getGuestData();
  const used = data.claims[feature] ?? [];
  if (used.includes(itemKey)) return true;
  if (used.length >= GUEST_ITEM_ALLOWANCE) return false;
  data.claims[feature] = [...used, itemKey];
  await save(data);
  return true;
}

export async function recordGuestResult(wordGroupId: string, wasCorrect: boolean): Promise<void> {
  const data = await getGuestData();
  const current = data.results[wordGroupId] ?? { correct: 0, incorrect: 0, lastSeenAt: '' };
  data.results[wordGroupId] = {
    correct: current.correct + (wasCorrect ? 1 : 0),
    incorrect: current.incorrect + (wasCorrect ? 0 : 1),
    lastSeenAt: new Date().toISOString(),
  };
  await save(data);
}

/** Stars or un-stars a word; returns whether it's now a favorite. */
export async function toggleGuestFavorite(wordGroupId: string): Promise<boolean> {
  const data = await getGuestData();
  const isFavorite = data.favorites.includes(wordGroupId);
  data.favorites = isFavorite ? data.favorites.filter((id) => id !== wordGroupId) : [...data.favorites, wordGroupId];
  await save(data);
  return !isFavorite;
}

export async function clearGuestData(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_DATA_STORAGE_KEY);
}

export function hasGuestData(data: GuestData): boolean {
  return (
    Object.values(data.claims).some((keys) => (keys?.length ?? 0) > 0) ||
    Object.keys(data.results).length > 0 ||
    data.favorites.length > 0
  );
}

/** The used items in the shape import_guest_feature_items expects (at most 2 per feature). */
export function claimsForImport(data: GuestData): { feature: CountedFeature; item_key: string }[] {
  // Device-only features (e.g. search results opened) are never sent.
  return (Object.entries(data.claims) as [CountedFeature, string[]][]).filter(([feature]) => isServerCounted(feature)).flatMap(([feature, keys]) =>
    keys.slice(0, GUEST_ITEM_ALLOWANCE).map((item_key) => ({ feature, item_key }))
  );
}
