import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { listProfiles } from '@/data/profiles';
import type { Profile } from '@/types/models';

const ACTIVE_PROFILE_STORAGE_KEY = 'learn-tunisian.active-profile-id';

interface ActiveProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  isLoading: boolean;
  setActiveProfileId: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<Profile[]>;
}

const ActiveProfileContext = createContext<ActiveProfileContextValue | undefined>(undefined);

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
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
      const storedIsValid = storedId && fetched.some((p) => p.id === storedId);
      setActiveProfileIdState(storedIsValid ? storedId : null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const setActiveProfileId = useCallback(async (profileId: string) => {
    setActiveProfileIdState(profileId);
    await AsyncStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  }, []);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
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
