import { router } from 'expo-router';
import { useEffect } from 'react';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';
import type { LearningGoal } from '@/types/models';

const GOAL_OPTIONS: { value: LearningGoal; label: string; subtitle: string }[] = [
  { value: 'family', label: 'Connect with family', subtitle: 'Talk with relatives in their own words' },
  { value: 'travel', label: 'Travel', subtitle: 'Get around and order like a local' },
  { value: 'heritage', label: 'Heritage/roots', subtitle: 'Reconnect with where your family is from' },
  { value: 'fun', label: 'Just for fun', subtitle: 'Curious about the language and culture' },
];

/**
 * The true entry point for starting any new profile — reached before an
 * account exists, so it resets draft onboarding state on mount (this is
 * the one place that needs to, since OnboardingProvider now lives at the
 * root layout and persists across the whole app rather than remounting
 * fresh per onboarding attempt).
 */
export default function GoalSelect() {
  const { state, update, reset } = useOnboarding();

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnboardingStepLayout
      title="What brings you to Tunisian Arabic?"
      subtitle="We'll shape your first lessons and conversations around this."
      footer={
        <Button
          label="Continue"
          onPress={() => router.push('/auth/sign-up')}
          disabled={state.learningGoal === null}
        />
      }
    >
      {GOAL_OPTIONS.map((option) => (
        <SelectableCard
          key={option.value}
          title={option.label}
          subtitle={option.subtitle}
          selected={state.learningGoal === option.value}
          onPress={() => update({ learningGoal: option.value })}
        />
      ))}
    </OnboardingStepLayout>
  );
}
