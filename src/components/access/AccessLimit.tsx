import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CreateAccountPrompt } from '@/components/guest/CreateAccountPrompt';
import { openUpgradeFlow, PremiumGate } from '@/components/premium/Premium';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { spacing, type ThemeColors } from '@/constants/theme';
import { FREE_ITEM_TOTAL, type CountedFeature } from '@/lib/access/accessRules';
import { useAccess } from '@/lib/access/AccessContext';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Plural nouns for the limit copy — "your 5 free lessons". */
export const FEATURE_NOUN: Record<CountedFeature, string> = {
  lesson: 'lessons',
  phrasebook_category: 'phrasebook categories',
  grammar_note: 'grammar notes',
  proverb: 'proverbs',
  alphabet_letter: 'letters',
  repeat_after_me: 'Repeat After Me recordings',
  dictionary_result: 'search results',
};

export const freeLimitTitle = (feature: CountedFeature) => `You’ve used your ${FREE_ITEM_TOTAL} free ${FEATURE_NOUN[feature]}`;
const FREE_LIMIT_MESSAGE = 'Everything you’ve opened stays open. Premium opens the rest.';

/**
 * Shown instead of an item past the allowance (e.g. a direct link): a guest
 * gets the create-account prompt, a free account the Premium gate. Calm copy,
 * no countdown or urgency.
 */
export function AccessLimitScreen({ feature }: { feature: CountedFeature }) {
  const { tier } = useAccess();
  if (tier === 'guest') return <CreateAccountPrompt reason="keep-learning" />;
  return <PremiumGate title={freeLimitTitle(feature)} message={FREE_LIMIT_MESSAGE} />;
}

/**
 * The other outcomes of an access check: the item doesn't exist / isn't in
 * the preview, or the check itself failed (offline). Never shows the item.
 */
export function AccessCheckProblem({ kind, onRetry }: { kind: 'missing' | 'error'; onRetry?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScreenContainer themed>
      <BackButton themed />
      <View style={styles.container}>
        <Text style={styles.emoji}>{kind === 'missing' ? '🔍' : '😕'}</Text>
        <Text style={styles.title}>
          {kind === 'missing' ? 'This isn’t available' : 'Couldn’t check your access'}
        </Text>
        <Text style={styles.body}>
          {kind === 'missing' ? 'It may have moved or isn’t part of what you can open yet.' : 'Check your connection and try again.'}
        </Text>
        {kind === 'error' && onRetry ? <Button themed label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emoji: { fontSize: 48 },
    title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    body: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
  });

/** What tapping a locked item does: guests → create-account prompt, free → the upgrade flow. */
export function useLockedItemAction(): () => void {
  const { tier } = useAccess();
  return useCallback(() => {
    if (tier === 'guest') router.push({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
    else openUpgradeFlow();
  }, [tier]);
}
