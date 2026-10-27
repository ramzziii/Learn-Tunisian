// The light palette — this app's original, established look. Kept as the
// flat `colors`/`gradients` exports below for every screen not yet
// converted to the theme system (see src/lib/theme/ThemeContext.tsx), so
// nothing outside that converted set changes behavior at all.
export const lightColors = {
  background: '#FBF8F3',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  primary: '#3E7CB1',
  primaryLight: '#5B95C9',
  primaryDark: '#2C5A85',
  accent: '#F2A65A',
  accentLight: '#F6BE81',
  success: '#4CA771',
  successLight: '#6FC291',
  error: '#D9634C',
  textPrimary: '#242021',
  textSecondary: '#6B6560',
  textOnPrimary: '#FFFFFF',
  border: '#E7E0D6',
  locked: '#D9D2C6',
} as const;

// The dark palette — a deliberate design pass, not an inversion of light.
// Deep navy rather than pure black (softer, more premium); primary/success
// brightened for contrast against dark surfaces; two real elevation tiers
// (surface vs. surfaceRaised are genuinely different tones here, since dark
// UIs usually show elevation via lightness rather than shadow alone).
export const darkColors = {
  background: '#0F1419',
  surface: '#1A2028',
  surfaceRaised: '#232B35',
  primary: '#4E8AC2',
  primaryLight: '#6FA8D8',
  primaryDark: '#35618C',
  accent: '#F5B673',
  accentLight: '#F8CB99',
  success: '#5FBE87',
  successLight: '#7FCE9E',
  error: '#E2786A',
  textPrimary: '#F2F0ED',
  textSecondary: '#9CA3AD',
  textOnPrimary: '#FFFFFF',
  border: '#2A323C',
  locked: '#3A424C',
} as const;

export type ThemeColors = Record<keyof typeof lightColors, string>;

function buildGradients(c: ThemeColors) {
  return {
    primary: [c.primaryLight, c.primaryDark] as const,
    accent: [c.accentLight, c.accent] as const,
    // Celebration stays a consistent warm gold in both themes deliberately —
    // a festive accent that should pop the same way regardless of theme.
    celebration: ['#FFD97D', c.accent] as const,
    success: [c.successLight, c.success] as const,
  };
}

export type ThemeGradients = ReturnType<typeof buildGradients>;

export const lightGradients = buildGradients(lightColors);
export const darkGradients = buildGradients(darkColors);

// Flat exports — the light theme, used directly by every screen not yet
// converted to useTheme(). Converted screens import lightColors/darkColors
// (or just useTheme()) instead.
export const colors = lightColors;
export const gradients = lightGradients;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

// The kid track uses larger touch targets and type sizes per the product
// requirement that it render "simpler visuals, bigger touch targets."
export const exerciseSizing = {
  touchTarget: 72,
  cardGap: spacing.md,
  titleFontSize: 22,
  bodyFontSize: 16,
} as const;
