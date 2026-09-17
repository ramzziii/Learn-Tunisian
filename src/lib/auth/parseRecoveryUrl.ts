import type { RecoveryLinkParams } from '@/lib/auth/AuthContext';

/**
 * Pulls the recovery credentials out of the deep link Supabase redirects to
 * after a user taps the "reset password" email link — shape depends on the
 * Supabase project's auth flow type, and this app doesn't control that
 * setting, so it supports both:
 *  - implicit flow: access_token/refresh_token in the URL *fragment*
 *    (`...#access_token=...&refresh_token=...&type=recovery`)
 *  - PKCE flow: a single-use `code` in the query string
 *    (`...?code=...`)
 * Returns null if neither shape is present (e.g. the screen was opened
 * directly, not via a real recovery link).
 */
export function parseRecoveryUrl(url: string): RecoveryLinkParams | null {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  if (hashIndex !== -1) {
    const hashParams = new URLSearchParams(url.slice(hashIndex + 1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken && refreshToken) return { accessToken, refreshToken };
  }

  if (queryIndex !== -1) {
    const queryEnd = hashIndex !== -1 ? hashIndex : url.length;
    const queryParams = new URLSearchParams(url.slice(queryIndex + 1, queryEnd));
    const code = queryParams.get('code');
    if (code) return { code };
  }

  return null;
}
