import AsyncStorage from '@react-native-async-storage/async-storage';

interface DailyChallengeFlags {
  date: string; // local "YYYY-MM-DD" this record belongs to
  reviewCompleted: boolean;
  speakingCompleted: boolean;
}

function todayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function storageKey(profileId: string): string {
  return `learn-tunisian.daily-challenge-progress.${profileId}`;
}

const EMPTY_FLAGS: Omit<DailyChallengeFlags, 'date'> = { reviewCompleted: false, speakingCompleted: false };

/**
 * Completion flags for the two daily challenges that can't be derived from
 * already-fetched server data (minutes/words-practiced-today come straight
 * from HomeData instead — see src/lib/dailyChallenges.ts). Local-only,
 * per-profile, auto-resets at local midnight — same pattern as
 * src/lib/alphabetProgress.ts, not a new backend table.
 */
export async function getTodayChallengeFlags(profileId: string): Promise<Omit<DailyChallengeFlags, 'date'>> {
  const raw = await AsyncStorage.getItem(storageKey(profileId));
  if (!raw) return EMPTY_FLAGS;
  try {
    const parsed = JSON.parse(raw) as DailyChallengeFlags;
    if (parsed.date !== todayKey()) return EMPTY_FLAGS; // yesterday's flags don't carry over
    return { reviewCompleted: !!parsed.reviewCompleted, speakingCompleted: !!parsed.speakingCompleted };
  } catch {
    return EMPTY_FLAGS;
  }
}

async function setFlag(profileId: string, key: 'reviewCompleted' | 'speakingCompleted'): Promise<void> {
  const current = await getTodayChallengeFlags(profileId);
  const next: DailyChallengeFlags = { date: todayKey(), ...current, [key]: true };
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(next));
}

export const markReviewCompletedToday = (profileId: string): Promise<void> => setFlag(profileId, 'reviewCompleted');
export const markSpeakingCompletedToday = (profileId: string): Promise<void> => setFlag(profileId, 'speakingCompleted');
