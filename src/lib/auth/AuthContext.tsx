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
}

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
