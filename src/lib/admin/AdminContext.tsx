import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface AdminContextValue {
  isAdmin: boolean;
  isLoading: boolean;
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

/**
 * A sibling to ActiveProfileContext, not a change to AuthContext — same
 * pattern of "a second context keyed off useAuth()'s session owns one more
 * piece of account-derived state," so the dozens of screens that only need
 * the session itself don't pay for an extra accounts round-trip.
 */
export function AdminProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const accountId = session?.user.id ?? null;

  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accountId) {
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    supabase
      .from('accounts')
      .select('is_admin')
      .eq('id', accountId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        setIsAdmin(!error && data?.is_admin === true);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const value = useMemo<AdminContextValue>(() => ({ isAdmin, isLoading }), [isAdmin, isLoading]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useIsAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useIsAdmin must be used within an AdminProvider');
  return ctx;
}
