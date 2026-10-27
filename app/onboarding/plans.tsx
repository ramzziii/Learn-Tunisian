import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { colors, spacing } from '@/constants/theme';

type PlanId = 'monthly' | 'yearly';

const REASSURANCES = [
  'Nothing is charged today',
  'Cancel anytime',
  'No hidden fees',
  'Prorated refund available if you cancel during the current billing period',
];

/**
 * An honest preview of pricing, not a real paywall — there's no payment
 * provider wired into this app yet (no Stripe/RevenueCat/IAP), so neither
 * button here charges anything or blocks anything. Both "Start free trial"
 * and "Skip for now" continue onboarding identically; this screen exists so
 * the plan/pricing shape is settled and ready for a real provider later,
 * and so pricing is visible before any payment is ever required. Also
 * reachable anytime afterward from Settings ("See plans & pricing").
 *
 * Also the upgrade flow every Premium-locked item opens (see
 * openUpgradeFlow in src/components/premium/Premium.tsx), with
 * `source=premium` — then both buttons return to where the learner was
 * instead of continuing onboarding, and the copy doesn't promise a trial
 * that nothing here can start.
 */
export default function Plans() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isUpgradeFlow = source === 'premium';

  // No longer an onboarding step (adults-only onboarding goes straight from
  // account creation to consent), so both buttons return to where the
  // learner opened it from.
  const goNext = () => router.back();

  return (
    <OnboardingStepLayout
      title={isUpgradeFlow ? 'Unlock everything with Premium' : 'Try Premium free for 7 days'}
      subtitle={
        isUpgradeFlow
          ? 'All lessons, phrasebook categories, grammar topics, letters, and unlimited review.'
          : 'See real progress before you ever pay anything.'
      }
      footer={
        <>
          <Button label="Start free trial" onPress={goNext} />
          <Button label={isUpgradeFlow ? 'Not now' : 'Skip for now'} variant="ghost" onPress={goNext} />
        </>
      }
    >
      <SelectableCard
        title="Yearly"
        subtitle="$59.99/year — Best value, ~17% less than monthly"
        selected={selectedPlan === 'yearly'}
        onPress={() => setSelectedPlan('yearly')}
      />
      <SelectableCard
        title="Monthly"
        subtitle="$5.99/month"
        selected={selectedPlan === 'monthly'}
        onPress={() => setSelectedPlan('monthly')}
      />

      <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
        {REASSURANCES.map((line) => (
          <Text key={line} style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
            ✓ {line}
          </Text>
        ))}
      </View>
    </OnboardingStepLayout>
  );
}
