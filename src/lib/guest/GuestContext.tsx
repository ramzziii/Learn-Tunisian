import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { setGuestSessionActive } from '@/lib/guest/guestSession';
import { GUEST_MODE_STORAGE_KEY } from '@/lib/localStorageKeys';

interface GuestContextValue {
  /** Signed out and in the guest preview (device only: no account, no server writes). */
  isGuest: boolean;
  isLoading: boolean;
  /** After the guest says they're 18 or older. */
  startGuest: () => Promise<void>;
  /** Leaves guest mode (the guest data itself is kept until carry-over or clearing). */
  endGuest: () => Promise<void>;
}

const GuestContext = createContext<GuestContextValue | undefined>(undefined);

/**
 * Guest preview on/off. Guests are signed out — there is no Supabase account
 * or anonymous user. Signing in always ends guest mode.
 */
export function GuestProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [isOn, setIsOn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_MODE_STORAGE_KEY)
      .then((v) => setIsOn(v === '1'))
      .catch(() => setIsOn(false))
      .finally(() => setIsLoading(false));
  }, []);

  const startGuest = useCallback(async () => {
    setIsOn(true);
    await AsyncStorage.setItem(GUEST_MODE_STORAGE_KEY, '1').catch(() => undefined);
  }, []);

  const endGuest = useCallback(async () => {
    setIsOn(false);
    await AsyncStorage.removeItem(GUEST_MODE_STORAGE_KEY).catch(() => undefined);
  }, []);

  const isGuest = isOn && !session;
  // The data layer reads this flag (src/lib/guest/guestSession.ts).
  setGuestSessionActive(isGuest);
  useEffect(() => () => setGuestSessionActive(false), []);

  const value = useMemo<GuestContextValue>(
    () => ({ isGuest, isLoading, startGuest, endGuest }),
    [isGuest, isLoading, startGuest, endGuest]
  );
  // Nothing renders until guest mode is known (one device read): a screen
  // that loads data before then would see "not a guest" and read the
  // signed-in tables, which return nothing to a signed-out visitor.
  if (isLoading) return null;
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

/** Outside a provider (e.g. isolated tests) this reports "not a guest". */
export function useGuest(): GuestContextValue {
  return (
    useContext(GuestContext) ?? {
      isGuest: false,
      isLoading: false,
      startGuest: async () => undefined,
      endGuest: async () => undefined,
    }
  );
}
