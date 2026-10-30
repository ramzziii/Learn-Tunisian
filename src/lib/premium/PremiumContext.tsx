import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useIsAdmin } from '@/lib/admin/AdminContext';
import { ADMIN_PREVIEW_STORAGE_KEY } from '@/lib/localStorageKeys';
import { resolveEffectivePremium, type AdminPremiumPreview } from '@/lib/premium/access';

interface PremiumContextValue {
  /** The entitlement every Premium gate should use — never read
   * activeProfile.isPremium directly (it ignores admin access). */
  isPremium: boolean;
  /** False until admin status and the admin's saved preview are known —
   * screens that gate *loading* (lesson, review, …) wait for this so an
   * admin never sees a gate flash before their access resolves. */
  isResolved: boolean;
  isAdmin: boolean;
  adminPreview: AdminPremiumPreview;
  setAdminPreview: (next: AdminPremiumPreview) => void;
}

const STORAGE_KEY = ADMIN_PREVIEW_STORAGE_KEY;

const PremiumContext = createContext<PremiumContextValue | undefined>(undefined);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useActiveProfile();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  // Admins see the app as Premium unless they've chosen to preview the free plan.
  const [adminPreview, setAdminPreviewState] = useState<AdminPremiumPreview>('premium');
  const [isPreviewLoaded, setIsPreviewLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'premium' || stored === 'free') setAdminPreviewState(stored);
      })
      .catch(() => {})
      .finally(() => setIsPreviewLoaded(true));
  }, []);

  const setAdminPreview = useCallback((next: AdminPremiumPreview) => {
    setAdminPreviewState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort — the preview still applies for this session.
    });
  }, []);

  const value = useMemo<PremiumContextValue>(
    () => ({
      isPremium: resolveEffectivePremium({
        profileIsPremium: activeProfile?.isPremium ?? false,
        isAdmin,
        adminPreview,
      }),
      isResolved: !isAdminLoading && isPreviewLoaded,
      isAdmin,
      adminPreview,
      setAdminPreview,
    }),
    [activeProfile?.isPremium, isAdmin, isAdminLoading, adminPreview, isPreviewLoaded, setAdminPreview]
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used within a PremiumProvider');
  return ctx;
}
