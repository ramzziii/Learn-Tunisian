// Device-local keys that aren't scoped by a profile id, in one place so
// account deletion (src/lib/account/localAccountCleanup.ts) clears the same
// keys the app writes. Per-profile keys follow
// `learn-tunisian.<feature>.<profileId>` and are found by their suffix.

/** The profile in use on this device (ActiveProfileContext). */
export const ACTIVE_PROFILE_STORAGE_KEY = 'learn-tunisian.active-profile-id';

/** An admin's "view the app as free/Premium" switch (PremiumContext). */
export const ADMIN_PREVIEW_STORAGE_KEY = 'learn-tunisian.admin-premium-preview';

/** Device-wide light/dark preference (ThemeContext) — not account data, kept on deletion. */
export const THEME_STORAGE_KEY = 'learn-tunisian.theme-preference';

/**
 * Cached tutor speech is written to the cache directory as
 * `tutor-speech-<profile id>-<timestamp>.mp3`, so one account's files can be
 * removed without touching another's.
 */
export function tutorSpeechFilePrefix(profileId: string): string {
  return `tutor-speech-${profileId}-`;
}
