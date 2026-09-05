import AsyncStorage from '@react-native-async-storage/async-storage';

interface AlphabetProgressData {
  practicedLetterIds: string[];
  practicedDiacriticIds: string[];
}

const EMPTY: AlphabetProgressData = { practicedLetterIds: [], practicedDiacriticIds: [] };

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
      practicedDiacriticIds: Array.isArray(parsed.practicedDiacriticIds) ? parsed.practicedDiacriticIds : [],
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

export async function markDiacriticPracticed(profileId: string, diacriticId: string): Promise<AlphabetProgressData> {
  const current = await getAlphabetProgress(profileId);
  if (current.practicedDiacriticIds.includes(diacriticId)) return current;
  const next = { ...current, practicedDiacriticIds: [...current.practicedDiacriticIds, diacriticId] };
  await save(profileId, next);
  return next;
}
