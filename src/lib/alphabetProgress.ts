import AsyncStorage from '@react-native-async-storage/async-storage';

interface AlphabetProgressData {
  practicedLetterIds: string[];
  /** Letters whose detail view has been opened at least once — tracked separately from practicedLetterIds since viewing is a much lighter-weight signal than completing an exercise, and shouldn't inflate the main practice progress %. Drives the "accessed/visited" coloring on the Letters grid alongside practicedLetterIds. */
  viewedLetterIds: string[];
  /** Same idea as viewedLetterIds, but for the Diacritics screen's own letter picker. */
  viewedDiacriticLetterIds: string[];
}

const EMPTY: AlphabetProgressData = { practicedLetterIds: [], viewedLetterIds: [], viewedDiacriticLetterIds: [] };

function storageKey(profileId: string): string {
  return `learn-tunisian.alphabet-progress.${profileId}`;
}

/**
 * Alphabet practice is local-only, per-profile progress (AsyncStorage), not
 * a Supabase table — it's a lightweight "have you touched this letter yet"
 * signal for the library screen, not the spaced-repetition mastery tracking
 * that word_groups get.
 */
export async function getAlphabetProgress(profileId: string): Promise<AlphabetProgressData> {
  const raw = await AsyncStorage.getItem(storageKey(profileId));
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return {
      practicedLetterIds: Array.isArray(parsed.practicedLetterIds) ? parsed.practicedLetterIds : [],
      viewedLetterIds: Array.isArray(parsed.viewedLetterIds) ? parsed.viewedLetterIds : [],
      viewedDiacriticLetterIds: Array.isArray(parsed.viewedDiacriticLetterIds) ? parsed.viewedDiacriticLetterIds : [],
    };
  } catch {
    return EMPTY;
  }
}

async function save(profileId: string, data: AlphabetProgressData): Promise<void> {
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(data));
}

export async function markLettersPracticed(profileId: string, letterIds: string[]): Promise<AlphabetProgressData> {
  const current = await getAlphabetProgress(profileId);
  const merged = Array.from(new Set([...current.practicedLetterIds, ...letterIds]));
  const next = { ...current, practicedLetterIds: merged };
  await save(profileId, next);
  return next;
}

export async function markLetterViewed(profileId: string, letterId: string): Promise<AlphabetProgressData> {
  const current = await getAlphabetProgress(profileId);
  if (current.viewedLetterIds.includes(letterId)) return current;
  const next = { ...current, viewedLetterIds: [...current.viewedLetterIds, letterId] };
  await save(profileId, next);
  return next;
}

export async function markDiacriticLetterViewed(profileId: string, letterId: string): Promise<AlphabetProgressData> {
  const current = await getAlphabetProgress(profileId);
  if (current.viewedDiacriticLetterIds.includes(letterId)) return current;
  const next = { ...current, viewedDiacriticLetterIds: [...current.viewedDiacriticLetterIds, letterId] };
  await save(profileId, next);
  return next;
}
