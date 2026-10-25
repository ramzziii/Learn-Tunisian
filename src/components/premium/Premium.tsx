import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

// Fixed gold, not theme-derived — the Premium marker should read identically
// in both themes, same reasoning as the celebration gradient.
const PREMIUM_GOLD = '#D9A441';

/**
 * Opens the app's existing upgrade flow — the plans screen, flagged so it
 * returns here instead of continuing onboarding. Every locked item routes
 * through this one function.
 */
export function openUpgradeFlow(): void {
  router.push({ pathname: '/onboarding/plans', params: { source: 'premium' } });
}

/** Small "Premium" pill marking a locked item. */
export function PremiumBadge({ style, compact = false }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  return (
    <View
      style={[styles.badge, compact && styles.badgeCompact, style]}
      accessibilityLabel="Premium"
      accessibilityRole="text"
    >
      <Text style={[styles.badgeText, compact && styles.badgeTextCompact]}>{compact ? '🔒' : '🔒 Premium'}</Text>
    </View>
  );
}

/**
 * Full-screen gate shown *instead of* starting a locked activity — the
 * content behind it is never loaded or started first.
 */
export function PremiumGate({ title, message }: { title: string; message: string }) {
  const { colors } = useTheme();
  const themed = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScreenContainer themed>
      <BackButton themed />
      <View style={themed.container}>
        <Text style={themed.emoji}>🔒</Text>
        <PremiumBadge />
        <Text style={themed.title}>{title}</Text>
        <Text style={themed.message}>{message}</Text>
        <Button themed label="See Premium plans" onPress={openUpgradeFlow} style={themed.button} />
        <Button
          themed
          label="Not now"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          style={themed.button}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: `${PREMIUM_GOLD}26`,
    borderRadius: radii.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  badgeCompact: { paddingHorizontal: 6 },
  badgeText: { fontSize: 11, fontWeight: '800', color: PREMIUM_GOLD, letterSpacing: 0.3 },
  badgeTextCompact: { fontSize: 10 },
});

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emoji: { fontSize: 48, marginBottom: spacing.xs },
    title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
    message: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: spacing.md },
    button: { alignSelf: 'stretch' },
  });
