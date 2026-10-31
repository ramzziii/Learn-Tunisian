import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/display/displayRules';
import type { DisplayPreferences, FormPreference, ScriptPreference } from '@/types/models';

/**
 * The display-preferences context and hook, with no data or account
 * imports, so any component (TunisianText, FormDisplay…) can read the
 * preferences without pulling in Supabase or storage. The provider that
 * loads and saves them is DisplayPreferencesProvider
 * (src/lib/display/DisplayPreferencesContext.tsx).
 */

export type SavePreferenceResult = { ok: true } | { ok: false; message: string };

export interface DisplayPreferencesContextValue {
  preferences: DisplayPreferences;
  setScript: (script: ScriptPreference) => Promise<SavePreferenceResult>;
  setForm: (form: FormPreference) => Promise<SavePreferenceResult>;
}

export const SAVE_FAILED_MESSAGE = 'Couldn’t save your display setting. Check your connection and try again.';
const notSaved = async (): Promise<SavePreferenceResult> => ({ ok: false, message: SAVE_FAILED_MESSAGE });

export const DisplayPreferencesContext = createContext<DisplayPreferencesContextValue | undefined>(undefined);

/**
 * Fixed preferences for a subtree — Settings' live preview, and tests. Its
 * setters do nothing.
 */
export function DisplayPreferencesOverride({ preferences, children }: { preferences: DisplayPreferences; children: ReactNode }) {
  const value = useMemo<DisplayPreferencesContextValue>(
    () => ({ preferences, setScript: notSaved, setForm: notSaved }),
    [preferences]
  );
  return <DisplayPreferencesContext.Provider value={value}>{children}</DisplayPreferencesContext.Provider>;
}

const FALLBACK: DisplayPreferencesContextValue = {
  preferences: DEFAULT_DISPLAY_PREFERENCES,
  setScript: notSaved,
  setForm: notSaved,
};

/** The current display preferences — the defaults (both/both) outside a provider. */
export function useDisplayPreferences(): DisplayPreferencesContextValue {
  return useContext(DisplayPreferencesContext) ?? FALLBACK;
}
