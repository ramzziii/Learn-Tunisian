import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { claimFeatureItem, fetchMyClaims, type ClaimsByFeature } from '@/data/featureClaims';
import {
  decideItemAccess,
  FREE_ITEM_TOTAL,
  tierOf,
  type CountedFeature,
  type ItemDecision,
  type Tier,
} from '@/lib/access/accessRules';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { useGuest } from '@/lib/guest/GuestContext';
import { claimGuestItem, getGuestData } from '@/lib/guest/guestStore';
import { usePremium } from '@/lib/premium/PremiumContext';
import { clearSearchIndex } from '@/lib/search/searchIndexCache';

/** An admin previewing the free plan counts here, never in their real (server) counts. */
const previewKey = (profileId: string) => `learn-tunisian.preview-claims.${profileId}`;

type Source = 'none' | 'guest' | 'server' | 'preview';

interface AccessValue {
  tier: Tier;
  /** False until the used-item counts are loaded. */
  isResolved: boolean;
  /** Set when the counts couldn't be loaded — screens show an explicit error, never Premium content. */
  loadError: boolean;
  claimed: (feature: CountedFeature) => ReadonlySet<string>;
  decide: (feature: CountedFeature, itemKey: string, opts?: { completed?: boolean }) => ItemDecision;
  /**
   * Opens an item: true if it may be opened (using one item if needed), false
   * at the limit. Throws if the server can't be reached — never a silent "yes".
   */
  open: (feature: CountedFeature, itemKey: string, opts?: { completed?: boolean }) => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Admin free-plan preview only: clears the local preview counts. Never touches real (server) counts. */
  resetPreview: () => Promise<void>;
}

const AccessContext = createContext<AccessValue | undefined>(undefined);

/**
 * The one access layer: tier (guest / free / premium) from sign-in, guest mode
 * and the effective Premium entitlement, plus the used-item counts from the
 * right place for that tier. Rules: src/lib/access/accessRules.ts.
 */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { isGuest } = useGuest();
  const { isPremium, isResolved: premiumResolved, isAdmin, adminPreview } = usePremium();
  const { activeProfile } = useActiveProfile();
  const profileId = activeProfile?.id ?? null;

  const tier = tierOf({ signedIn: !!session, isPremium });
  const source: Source =
    tier === 'premium' ? 'none' : tier === 'guest' ? (isGuest ? 'guest' : 'none') : isAdmin && adminPreview === 'free' ? 'preview' : 'server';

  const [claims, setClaimsState] = useState<ClaimsByFeature>({});
  // The current counts, updated immediately (not on the next render), so quick
  // successive opens can never use more than the allowance.
  const claimsRef = useRef<ClaimsByFeature>({});
  const setClaims = useCallback((next: ClaimsByFeature) => {
    claimsRef.current = next;
    setClaimsState(next);
  }, []);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const sourceKey = `${source}:${source === 'preview' ? profileId : ''}:${session?.user.id ?? ''}`;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      if (source === 'guest') setClaims((await getGuestData()).claims);
      else if (source === 'server') setClaims(await fetchMyClaims());
      else if (source === 'preview' && profileId) {
        const raw = await AsyncStorage.getItem(previewKey(profileId)).catch(() => null);
        setClaims(raw ? (JSON.parse(raw) as ClaimsByFeature) : {});
      } else setClaims({});
    } catch {
      setClaims({});
      setLoadError(true);
    } finally {
      setLoadedFor(sourceKey);
    }
  }, [source, profileId, sourceKey, setClaims]);

  useEffect(() => {
    if (premiumResolved) load();
  }, [load, premiumResolved]);

  // The in-memory search index only ever covers what this learner can open:
  // drop it on sign-out / account change and whenever the tier changes.
  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    clearSearchIndex();
  }, [sessionUserId, tier]);

  const claimed = useCallback((feature: CountedFeature) => new Set(claims[feature] ?? []), [claims]);

  // The admin's free-plan preview shows what a new free account sees: the
  // admin's own completed lessons don't reopen for free there — only the
  // preview's own counts do.
  const countsCompleted = source !== 'preview';

  const decide = useCallback(
    (feature: CountedFeature, itemKey: string, opts?: { completed?: boolean }) =>
      decideItemAccess({ tier, claimed: claimed(feature), itemKey, completed: countsCompleted && opts?.completed, feature }),
    [tier, claimed, countsCompleted]
  );

  const open = useCallback(
    async (feature: CountedFeature, itemKey: string, opts?: { completed?: boolean }): Promise<boolean> => {
      const current = claimsRef.current;
      const decision = decideItemAccess({
        tier,
        claimed: new Set(current[feature] ?? []),
        itemKey,
        completed: countsCompleted && opts?.completed,
        feature,
      });
      if (decision === 'open') return true;
      if (decision === 'limit') return false;

      const next = { ...current, [feature]: [...new Set([...(current[feature] ?? []), itemKey])] };
      let allowed: boolean;
      if (source === 'guest') allowed = await claimGuestItem(feature, itemKey);
      else if (source === 'server') allowed = await claimFeatureItem(feature, itemKey);
      else if (source === 'preview' && profileId) {
        allowed = (current[feature]?.length ?? 0) < FREE_ITEM_TOTAL;
        if (allowed) await AsyncStorage.setItem(previewKey(profileId), JSON.stringify(next)).catch(() => undefined);
      } else allowed = false;

      if (allowed) setClaims({ ...claimsRef.current, [feature]: next[feature] });
      return allowed;
    },
    [tier, source, profileId, setClaims, countsCompleted]
  );

  const resetPreview = useCallback(async () => {
    if (source !== 'preview' || !profileId) return;
    await AsyncStorage.removeItem(previewKey(profileId)).catch(() => undefined);
    setClaims({});
  }, [source, profileId, setClaims]);

  const value = useMemo<AccessValue>(
    () => ({
      tier,
      isResolved: premiumResolved && loadedFor === sourceKey,
      loadError,
      claimed,
      decide,
      open,
      refresh: load,
      resetPreview,
    }),
    [tier, premiumResolved, loadedFor, sourceKey, loadError, claimed, decide, open, load, resetPreview]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within an AccessProvider');
  return ctx;
}
