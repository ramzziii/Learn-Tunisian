import AsyncStorage from '@react-native-async-storage/async-storage';

import { addFavorite } from '@/data/favorites';
import { importGuestClaims } from '@/data/featureClaims';
import { recordWordGroupResult } from '@/data/progress';
import { claimsForImport, clearGuestData, getGuestData } from '@/lib/guest/guestStore';

/** The synthetic guest profile's id — per-profile device keys end in `.guest`. */
const GUEST_KEY_SUFFIX = '.guest';

/**
 * Step 1, always (whatever the learner chooses next): records the items the
 * guest used on the new account, so the free total includes them. Idempotent
 * on the server; throws on failure (the device keeps everything).
 */
export async function importGuestUsage(): Promise<void> {
  await importGuestClaims(claimsForImport(await getGuestData()));
}

/**
 * Step 2, only with the learner's yes: practice results and saved words move
 * to the learner's profile. Throws on any failure, leaving the device data in place
 * so it can be retried (each write is safe to repeat).
 */
export async function moveGuestProgress(profileId: string): Promise<void> {
  const data = await getGuestData();
  for (const [wordGroupId, result] of Object.entries(data.results)) {
    await recordWordGroupResult(profileId, wordGroupId, result.correct > 0 && result.correct >= result.incorrect);
  }
  for (const wordGroupId of data.favorites) await addFavorite(profileId, wordGroupId);
}

/** Last: removes the preview's data and its per-profile device keys (`learn-tunisian.*.guest`). */
export async function clearGuestDevice(): Promise<void> {
  await clearGuestData();
  const keys = await AsyncStorage.getAllKeys();
  const guestKeys = keys.filter((k) => k.startsWith('learn-tunisian.') && k.endsWith(GUEST_KEY_SUFFIX));
  if (guestKeys.length > 0) await AsyncStorage.multiRemove(guestKeys);
}
