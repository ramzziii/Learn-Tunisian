export const colors = {
  background: '#FBF8F3',
  surface: '#FFFFFF',
  primary: '#3E7CB1',
  primaryDark: '#2C5A85',
  accent: '#F2A65A',
  success: '#4CA771',
  error: '#D9634C',
  textPrimary: '#242021',
  textSecondary: '#6B6560',
  border: '#E7E0D6',
  locked: '#D9D2C6',
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
