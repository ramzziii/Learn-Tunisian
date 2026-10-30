import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  darkColors,
  darkGradients,
  lightColors,
  lightGradients,
  shadows,
  type ThemeColors,
  type ThemeGradients,
} from '@/constants/theme';
import { THEME_STORAGE_KEY } from '@/lib/localStorageKeys';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  colors: ThemeColors;
  gradients: ThemeGradients;
  shadows: typeof shadows;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const STORAGE_KEY = THEME_STORAGE_KEY;

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Only the screens/components explicitly converted to useTheme() react to
 * this — everything else keeps importing the flat `colors`/`gradients` from
 * src/constants/theme.ts (the light palette), unaffected by this provider
 * existing. See the redesign plan for which screens are converted and why
 * the rest are deliberately not, yet.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort — the preference still applies for this session even if
      // it fails to persist.
    });
  };

  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      gradients: isDark ? darkGradients : lightGradients,
      shadows,
      isDark,
      preference,
      setPreference,
    }),
    [isDark, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
