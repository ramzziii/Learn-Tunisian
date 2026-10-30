import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { TimeWheelPicker } from '@/components/onboarding/TimeWheelPicker';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { colors, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { ProfileAlreadyExistsError } from '@/lib/account/profileLimit';
import { useAuth } from '@/lib/auth/AuthContext';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';
import type { DailyGoalMinutes } from '@/types/models';

const GOAL_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];

export default function DailyGoalSetup() {
  const { state, update, submit, reset } = useOnboarding();
  const { session } = useAuth();
  const { refreshProfiles, setActiveProfileId } = useActiveProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One profile per account: if this account already has one (set up on
  // another device, or a second tab), offer the way to it, not a retry.
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

  const reminderHour = state.reminderHour ?? 18;
  const reminderMinute = state.reminderMinute ?? 0;

  const canFinish = state.dailyGoalMinutes !== null;

  const handleFinish = async () => {
    if (!session) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const profile = await submit(session.user.id);
      await refreshProfiles();
      await setActiveProfileId(profile.id);
      reset();
      router.replace('/home');
    } catch (e) {
      setHasExistingProfile(e instanceof ProfileAlreadyExistsError);
      setError(
        e instanceof ProfileAlreadyExistsError
          ? 'This account already has a learner profile, so a new one wasn’t created. Your existing profile and progress are unchanged.'
          : e instanceof Error
            ? e.message
            : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueToExistingProfile = async () => {
    await refreshProfiles();
    reset();
    router.replace('/');
  };

  return (
    <OnboardingStepLayout
      title="Set a daily goal"
      subtitle="You can change this anytime from settings."
      step={5}
      totalSteps={5}
      footer={
        <>
          {error ? <Text style={{ color: colors.error, marginBottom: spacing.sm }}>{error}</Text> : null}
          {hasExistingProfile ? (
            <Button label="Continue to my profile" onPress={continueToExistingProfile} />
          ) : (
            <Button label="Finish setup" onPress={handleFinish} disabled={!canFinish} loading={isSubmitting} />
          )}
        </>
      }
    >
      <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: spacing.sm }}>
        How many minutes a day?
      </Text>
      {GOAL_OPTIONS.map((minutes) => (
        <SelectableCard
          key={minutes}
          title={`${minutes} minutes a day`}
          selected={state.dailyGoalMinutes === minutes}
          onPress={() => update({ dailyGoalMinutes: minutes })}
        />
      ))}

      <Text style={{ fontSize: 14, fontWeight: '600', marginTop: spacing.xl, marginBottom: spacing.md }}>
        Daily reminder time
      </Text>
      <TimeWheelPicker
        hour24={reminderHour}
        minute={reminderMinute}
        onChange={(hour24, minute) => update({ reminderHour: hour24, reminderMinute: minute })}
      />
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: spacing.md }}>
        We&apos;ll send one gentle daily reminder — never a guilt trip, never a streak warning.
      </Text>
    </OnboardingStepLayout>
  );
}
