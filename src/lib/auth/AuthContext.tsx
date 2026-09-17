import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

// Auth is modeled as "one Supabase session, reached via one or more sign-in
// methods." v1 only implements signInWithEmail/signUpWithEmail, but Google
// and Apple sign-in later just add sibling methods here (e.g.
// signInWithGoogle) that also resolve to a Supabase session — nothing about
// how `session`/`isLoading` are consumed elsewhere in the app needs to change.
interface SignUpResult {
  error: string | null;
  /** True when Supabase requires clicking an email confirmation link before a session exists (the default project setting). */
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<SignUpResult>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Emails a password-recovery link to the given address. Always succeeds
   * from the caller's perspective for an unknown email too — Supabase itself
   * doesn't reveal whether an account exists, so neither does this app. */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Exchanges the tokens/code carried by the recovery deep link for a real
   * session, so updatePassword has something to act on. See
   * app/auth/reset-password.tsx for where the link's URL gets parsed. */
  establishRecoverySession: (params: RecoveryLinkParams) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

/** Either shape a Supabase recovery redirect can carry, depending on the
 * project's auth flow type (implicit vs. PKCE) — see the comment above
 * parseRecoveryUrl in app/auth/reset-password.tsx. */
export type RecoveryLinkParams = { accessToken: string; refreshToken: string } | { code: string };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signUpWithEmail: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        // Supabase returns a user but no session when email confirmation is
        // required (the default) — that's the signal to show a "check your
        // email" message rather than treating sign-up as already complete.
        const needsEmailConfirmation = !error && data.user !== null && data.session === null;
        return { error: error?.message ?? null, needsEmailConfirmation };
      },
      signInWithEmail: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'learntunisian://auth/reset-password',
        });
        return { error: error?.message ?? null };
      },
      establishRecoverySession: async (params) => {
        const { error } =
          'code' in params
            ? await supabase.auth.exchangeCodeForSession(params.code)
            : await supabase.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken });
        return { error: error?.message ?? null };
      },
      updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return { error: error?.message ?? null };
      },
    }),
    [session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
