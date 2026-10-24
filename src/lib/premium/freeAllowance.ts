import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Usage of the free plan's metered allowances (daily review, Speed Match
 * sample round). Local-only, per-profile — same pattern and trade-off as
 * src/lib/dailyChallengeProgress.ts: reinstalling the app resets it, which is
 * acceptable for a free sample, not for anything paid. Usage is recorded when
 * an activity *starts*, so leaving mid-way can't be used to restart it, and
 * the limit is shown before starting so it never cuts an activity off.
 */

interface AllowanceRecord {
  /** Local "YYYY-MM-DD" of the last free review session started. */
  reviewStartedOn: string | null;
  speedMatchSampleUsed: boolean;
}

const EMPTY: AllowanceRecord = { reviewStartedOn: null, speedMatchSampleUsed: false };

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function storageKey(profileId: string): string {
  return `learn-tunisian.free-allowance.${profileId}`;
}

async function read(profileId: string): Promise<AllowanceRecord> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(profileId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AllowanceRecord>;
    return {
      reviewStartedOn: typeof parsed.reviewStartedOn === 'string' ? parsed.reviewStartedOn : null,
      speedMatchSampleUsed: parsed.speedMatchSampleUsed === true,
    };
  } catch {
    return EMPTY;
  }
}

async function write(profileId: string, patch: Partial<AllowanceRecord>): Promise<void> {
  const current = await read(profileId);
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify({ ...current, ...patch }));
}

export async function hasUsedFreeReviewToday(profileId: string): Promise<boolean> {
  return (await read(profileId)).reviewStartedOn === localDateKey();
}

export const markFreeReviewStarted = (profileId: string): Promise<void> =>
  write(profileId, { reviewStartedOn: localDateKey() });

export async function hasUsedSpeedMatchSample(profileId: string): Promise<boolean> {
  return (await read(profileId)).speedMatchSampleUsed;
}

export const markSpeedMatchSampleUsed = (profileId: string): Promise<void> =>
  write(profileId, { speedMatchSampleUsed: true });

/** Clears this profile's free-plan usage — used by the admin "preview free
 * plan" tools so the sample round / daily review can be re-tested. */
export async function resetFreeAllowances(profileId: string): Promise<void> {
  await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(EMPTY));
}
