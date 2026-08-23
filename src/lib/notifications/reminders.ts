import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Neutral, positive copy only — no streak-loss or guilt language, per the
// product's no-dark-patterns requirement. Keep new copy in this spirit.
const REMINDER_TITLE = 'Time for your Tunisian lesson!';
const REMINDER_BODY = "A few minutes today keeps it fresh. We'll be here whenever you're ready.";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function storageKeyFor(profileId: string): string {
  return `reminder-notification-id:${profileId}`;
}

// One local notification id per profile, tracked via the notification's own
// content.data so we can cancel-and-reschedule cleanly when the reminder
// time changes, without needing extra AsyncStorage bookkeeping.
async function findScheduledNotificationId(profileId: string): Promise<string | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const match = scheduled.find((n) => n.content.data?.profileId === profileId);
  return match?.identifier ?? null;
}

/**
 * Schedules (or reschedules) the one daily reminder for a profile at the
 * given "HH:mm" time, replacing any previous reminder for that profile.
 */
export async function scheduleDailyReminder(profileId: string, time: string): Promise<void> {
  const [hourStr, minuteStr] = time.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  await cancelDailyReminder(profileId);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: REMINDER_TITLE,
      body: REMINDER_BODY,
      data: { profileId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    },
  });
}

export async function cancelDailyReminder(profileId: string): Promise<void> {
  const existingId = await findScheduledNotificationId(profileId);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId);
  }
}

export function isNotificationsSupported(): boolean {
  // Android emulators without Google Play services and iOS simulators both
  // support local (non-push) scheduled notifications fine; this exists as a
  // single place to special-case a platform later if needed.
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
