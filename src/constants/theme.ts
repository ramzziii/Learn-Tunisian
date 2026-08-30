export const colors = {
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

// Gradient pairs — used with expo-linear-gradient for headers, primary
// buttons, and celebration moments, so the app doesn't read as flat blocks
// of solid color everywhere.
export const gradients = {
  primary: [colors.primaryLight, colors.primaryDark] as const,
  accent: [colors.accentLight, colors.accent] as const,
  celebration: ['#FFD97D', colors.accent] as const,
  success: [colors.successLight, colors.success] as const,
} as const;

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
export const kidTrackSizing = {
  touchTarget: 96,
  cardGap: spacing.lg,
  titleFontSize: 28,
  bodyFontSize: 20,
} as const;

export const adultTrackSizing = {
  touchTarget: 72,
  cardGap: spacing.md,
  titleFontSize: 22,
  bodyFontSize: 16,
} as const;
