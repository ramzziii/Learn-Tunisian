import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth/AuthContext';
import { useGuest } from '@/lib/guest/GuestContext';
import { listProfiles } from '@/data/profiles';
import { ACTIVE_PROFILE_STORAGE_KEY } from '@/lib/localStorageKeys';
import type { Profile } from '@/types/models';

interface ActiveProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  isLoading: boolean;
  setActiveProfileId: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<Profile[]>;
}

/** The device-only profile used in the signed-out guest preview. Never on the server, never Premium. */
export const GUEST_PROFILE_ID = 'guest';
const GUEST_PROFILE: Profile = {
  id: GUEST_PROFILE_ID,
  accountId: GUEST_PROFILE_ID,
  name: 'there',
  dateOfBirth: '',
  nativeLanguage: '',
  country: '',
  startingProficiency: 'none',
  learningGoal: null,
  isPremium: false,
  createdAt: '',
};

const ActiveProfileContext = createContext<ActiveProfileContextValue | undefined>(undefined);

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { isGuest } = useGuest();
  const accountId = session?.user.id ?? null;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfiles = useCallback(async () => {
    if (!accountId) {
      setProfiles([]);
      return [];
    }
    const fetched = await listProfiles(accountId);
    setProfiles(fetched);
    // Same rule as on load: an account's only profile is the active one.
    setActiveProfileIdState((current) =>
      current && fetched.some((p) => p.id === current) ? current : fetched.length === 1 ? fetched[0].id : null
    );
    return fetched;
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      setProfiles([]);
      setActiveProfileIdState(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const [fetched, storedId] = await Promise.all([
        listProfiles(accountId),
        AsyncStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY),
      ]);
      if (cancelled) return;
      setProfiles(fetched);
      // One profile per account: an account's only profile is simply used.
      // An account that already has several (from before profiles were
      // limited to one) keeps them all; until the learner picks one on the
      // one-time chooser (app/profiles/index.tsx) none is chosen silently.
      const storedIsValid = storedId && fetched.some((p) => p.id === storedId);
      setActiveProfileIdState(storedIsValid ? storedId : fetched.length === 1 ? fetched[0].id : null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Re-read profiles (and so is_premium) whenever the app comes back to the
  // foreground, so a Premium change made elsewhere isn't stale.
  useEffect(() => {
    if (!accountId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshProfiles().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [accountId, refreshProfiles]);

  const setActiveProfileId = useCallback(async (profileId: string) => {
    setActiveProfileIdState(profileId);
    await AsyncStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  }, []);

  const activeProfile = useMemo(
    () => (isGuest && !accountId ? GUEST_PROFILE : (profiles.find((p) => p.id === activeProfileId) ?? null)),
    [isGuest, accountId, profiles, activeProfileId]
  );

  const value = useMemo<ActiveProfileContextValue>(
    () => ({ profiles, activeProfile, isLoading, setActiveProfileId, refreshProfiles }),
    [profiles, activeProfile, isLoading, setActiveProfileId, refreshProfiles]
  );

  return <ActiveProfileContext.Provider value={value}>{children}</ActiveProfileContext.Provider>;
}

export function useActiveProfile(): ActiveProfileContextValue {
  const ctx = useContext(ActiveProfileContext);
  if (!ctx) throw new Error('useActiveProfile must be used within an ActiveProfileProvider');
  return ctx;
}
