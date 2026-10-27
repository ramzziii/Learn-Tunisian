import type { RecoveryLinkParams } from '@/lib/auth/AuthContext';

/**
 * Pulls the recovery code out of the deep link Supabase redirects to after a
 * user taps the "reset password" email link. The client uses the PKCE flow
 * (src/lib/supabase/client.ts), so a genuine link carries a single-use
 * `?code=` that only this device can exchange — it holds the code verifier
 * from when the reset was requested.
 *
 * Session tokens in the URL fragment (`#access_token=...&refresh_token=...`,
 * the old implicit-flow shape) are deliberately ignored: installing them
 * would let any app or web page that opens this route sign the learner into
 * an account of its choosing (run-1 security audit).
 *
 * Returns null if there is no code (e.g. the screen was opened directly).
 */
export function parseRecoveryUrl(url: string): RecoveryLinkParams | null {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1 || (hashIndex !== -1 && queryIndex > hashIndex)) return null;

  const queryEnd = hashIndex !== -1 ? hashIndex : url.length;
  const code = new URLSearchParams(url.slice(queryIndex + 1, queryEnd)).get('code');
  return code ? { code } : null;
}
