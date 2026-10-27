/** Shared across taps (e.g. a component ref) so only one request runs at a time. */
export interface PasswordResetGuard {
  current: boolean;
}

export type PasswordResetOutcome =
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string }
  /** A request was already in flight — this tap was ignored. */
  | { kind: 'busy' };

/**
 * Profile's "Change password": asks the existing reset flow
 * (AuthContext.sendPasswordReset → Supabase reset email with a 6-digit
 * code → entered in app/auth/reset-code.tsx) to email the signed-in account. Never sends
 * without an email, and never sends twice at once.
 */
export async function requestPasswordReset(options: {
  email: string | null | undefined;
  send: (email: string) => Promise<{ error: string | null }>;
  guard: PasswordResetGuard;
  /** Called just before a request is actually sent (not for busy/no-email). */
  onStart?: () => void;
}): Promise<PasswordResetOutcome> {
  const { send, guard } = options;
  if (guard.current) return { kind: 'busy' };

  const email = options.email?.trim();
  if (!email) {
    return { kind: 'error', message: 'This account has no email address on file, so a password-reset code can’t be sent.' };
  }

  guard.current = true;
  options.onStart?.();
  try {
    const { error } = await send(email);
    return error ? { kind: 'error', message: error } : { kind: 'sent', email };
  } catch {
    return { kind: 'error', message: 'Couldn’t send the reset email — check your connection and try again.' };
  } finally {
    guard.current = false;
  }
}
