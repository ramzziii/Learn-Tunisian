import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';

import { ACTIVE_PROFILE_STORAGE_KEY, ADMIN_PREVIEW_STORAGE_KEY, tutorSpeechFilePrefix } from '@/lib/localStorageKeys';
import { cancelDailyReminder } from '@/lib/notifications/reminders';

export type LocalCleanupStep = 'reminders' | 'storage' | 'files';

/**
 * Removes the deleted account's data from this device — and only that:
 * - its profiles' daily reminders;
 * - every saved key for its profiles (`learn-tunisian.<feature>.<profileId>`,
 *   and the older `reminder-notification-id:<profileId>`), found by the
 *   profile id suffix, so features added later are covered too;
 * - the active-profile choice, if it was one of its profiles;
 * - an admin's "view as" preview switch (only when the account was an admin);
 * - its cached tutor speech files.
 * Shared lesson audio (the audio-cache folder), device settings like the
 * theme, and other accounts' data on the same device are left alone. The
 * Supabase session is cleared separately, by signing out.
 *
 * Each step runs even if an earlier one fails; failures are returned rather
 * than thrown, since the account itself is already gone on the server.
 */
export async function clearLocalAccountData({
  profileIds,
  wasAdmin,
}: {
  profileIds: string[];
  wasAdmin: boolean;
}): Promise<{ failures: LocalCleanupStep[] }> {
  const failures: LocalCleanupStep[] = [];

  try {
    for (const profileId of profileIds) await cancelDailyReminder(profileId);
  } catch {
    failures.push('reminders');
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((key) => profileIds.some((id) => key.endsWith(`.${id}`) || key.endsWith(`:${id}`)));
    const activeProfileId = await AsyncStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (activeProfileId && profileIds.includes(activeProfileId)) toRemove.push(ACTIVE_PROFILE_STORAGE_KEY);
    if (wasAdmin) toRemove.push(ADMIN_PREVIEW_STORAGE_KEY);
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch {
    failures.push('storage');
  }

  try {
    const prefixes = profileIds.map(tutorSpeechFilePrefix);
    for (const entry of Paths.cache.list()) {
      if (prefixes.some((prefix) => entry.name.startsWith(prefix))) entry.delete();
    }
  } catch {
    failures.push('files');
  }

  return { failures };
}
