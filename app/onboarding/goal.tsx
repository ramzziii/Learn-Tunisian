import { router } from 'expo-router';
import { Text } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { DAILY_GOAL_OPTIONS } from '@/constants/dailyGoal';
import { colors, spacing } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

/**
 * Daily goal: 5, 10 or 15 minutes (10 pre-selected). A target, not a limit —
 * any session can be extended with "Add more time". The optional reminder is
 * the next step; the profile is created there.
 */
export default function DailyGoalSetup() {
  const { state, update } = useOnboarding();

  return (
    <OnboardingStepLayout
      title="How much time do you want to commit to learning Tunisian each day?"
      subtitle="Pick what fits your day. You can change it anytime in Profile, and keep going whenever you like."
      step={5}
      totalSteps={6}
      footer={
        <Button
          label="Continue"
          onPress={() => router.push('/onboarding/reminder')}
          disabled={state.dailyGoalMinutes === null}
        />
      }
    >
      {DAILY_GOAL_OPTIONS.map((minutes) => (
        <SelectableCard
          key={minutes}
          title={`${minutes} minutes a day`}
          selected={state.dailyGoalMinutes === minutes}
          onPress={() => update({ dailyGoalMinutes: minutes })}
        />
      ))}
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: spacing.md }}>
        Your goal is a target, not a limit — at the end of a session you can always add more time.
      </Text>
    </OnboardingStepLayout>
  );
}
