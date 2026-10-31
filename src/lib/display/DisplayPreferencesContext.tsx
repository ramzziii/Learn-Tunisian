import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { fetchDisplayPreferences, saveDisplayPreferences } from '@/data/displayPreferences';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/display/displayRules';
import {
  DisplayPreferencesContext,
  SAVE_FAILED_MESSAGE,
  type DisplayPreferencesContextValue,
  type SavePreferenceResult,
} from '@/lib/display/useDisplayPreferences';
import type { DisplayPreferences } from '@/types/models';

export { DisplayPreferencesOverride, useDisplayPreferences } from '@/lib/display/useDisplayPreferences';
export type { SavePreferenceResult } from '@/lib/display/useDisplayPreferences';

/**
 * The active profile's display preferences (script, default form). Both/both
 * while loading, when signed out, without a saved row, or if loading fails.
 * A change applies immediately and is saved; a failed save restores the
 * previous value and reports it.
 */
export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useActiveProfile();
  const profileId = activeProfile?.id ?? null;
  const [preferences, setPreferences] = useState<DisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const current = useRef(preferences);
  current.current = preferences;

  useEffect(() => {
    setPreferences(DEFAULT_DISPLAY_PREFERENCES);
    if (!profileId) return;
    let cancelled = false;
    fetchDisplayPreferences(profileId)
      .then((loaded) => {
        if (!cancelled) setPreferences(loaded);
      })
      .catch(() => {
        // Keep the defaults; nothing is lost, and Settings can save again.
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const update = useCallback(
    async (patch: Partial<DisplayPreferences>): Promise<SavePreferenceResult> => {
      if (!profileId) return { ok: false, message: SAVE_FAILED_MESSAGE };
      const previous = current.current;
      const next = { ...previous, ...patch };
      setPreferences(next);
      try {
        await saveDisplayPreferences(profileId, next);
        return { ok: true };
      } catch {
        setPreferences(previous);
        return { ok: false, message: SAVE_FAILED_MESSAGE };
      }
    },
    [profileId]
  );

  const value = useMemo<DisplayPreferencesContextValue>(
    () => ({
      preferences,
      setScript: (script) => update({ script }),
      setForm: (form) => update({ form }),
    }),
    [preferences, update]
  );

  return <DisplayPreferencesContext.Provider value={value}>{children}</DisplayPreferencesContext.Provider>;
}
