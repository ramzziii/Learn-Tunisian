import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/lib/theme/ThemeContext';

export type CreateAccountReason = 'keep-learning' | 'talk' | 'account';

const COPY: Record<CreateAccountReason, { emoji: string; title: string; body: string }> = {
  'keep-learning': {
    emoji: '🌱',
    title: 'Create a free account to keep learning',
    body: 'You’ve tried what the preview includes. A free account opens a few more lessons, phrases, notes and letters, and keeps your progress.',
  },
  talk: {
    emoji: '💬',
    title: 'Talk is for Premium members',
    body: 'Talk to a Tunisian is an AI conversation partner, available with Premium. Create a free account first — you can see the plans from there.',
  },
  account: {
    emoji: '👤',
    title: 'This needs an account',
    body: 'Create a free account to use this. Your preview progress can come with you.',
  },
};

/**
 * The guest preview's friendly prompt — shown when a guest reaches what the
 * preview includes or opens something that needs an account. Never blocks the
 * rest of the app ("Not now" goes back), no countdown, no urgency.
 */
export function CreateAccountPrompt({ reason = 'account' }: { reason?: CreateAccountReason }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const copy = COPY[reason];
  const isKeepLearning = reason === 'keep-learning';

  return (
    <ScreenContainer themed>
      <View style={styles.container}>
        <Text style={styles.emoji}>{copy.emoji}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {copy.title}
        </Text>
        <Text style={styles.body}>{copy.body}</Text>
        {!isKeepLearning ? <Text style={styles.cta}>Create a free account to keep learning.</Text> : null}
        <Button themed label="Create a free account" onPress={() => router.push('/onboarding/age')} style={styles.button} />
        <Button themed label="Sign in" variant="secondary" onPress={() => router.push('/auth/sign-in')} style={styles.button} />
        <Button
          themed
          label="Not now"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          style={styles.button}
        />
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'stretch', padding: spacing.lg, gap: spacing.sm },
    emoji: { fontSize: 48, textAlign: 'center' },
    title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
    body: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
    cta: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
    button: { marginTop: spacing.xs, borderRadius: radii.md },
  });
