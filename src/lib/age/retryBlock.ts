import AsyncStorage from '@react-native-async-storage/async-storage';

import { AGE_RETRY_BLOCK_STORAGE_KEY } from '@/lib/localStorageKeys';

/** How long this device can't retry the age gate or the guest preview after an under-18 answer. */
export const AGE_RETRY_BLOCK_HOURS = 24;

interface StoredBlock {
  blocked: true;
  /** ISO time the block ends. */
  until: string;
}

/**
 * Starts the cooling-off period after an under-18 date of birth or a guest's
 * "No". Stores only a yes/no flag and when it ends — never the date typed.
 * Device-only: reinstalling the app resets it, which is accepted.
 */
export async function blockAgeRetry(now: Date = new Date()): Promise<void> {
  const value: StoredBlock = { blocked: true, until: new Date(now.getTime() + AGE_RETRY_BLOCK_HOURS * 3_600_000).toISOString() };
  await AsyncStorage.setItem(AGE_RETRY_BLOCK_STORAGE_KEY, JSON.stringify(value));
}

/** Whether the retry block is on. Clears an expired or unreadable value. */
export async function isAgeRetryBlocked(now: Date = new Date()): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(AGE_RETRY_BLOCK_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredBlock>;
    const until = parsed.until ? new Date(parsed.until).getTime() : NaN;
    if (parsed.blocked === true && Number.isFinite(until) && now.getTime() < until) return true;
  } catch {
    // Unreadable: treat as not blocked and clear it below.
  }
  await AsyncStorage.removeItem(AGE_RETRY_BLOCK_STORAGE_KEY).catch(() => undefined);
  return false;
}
