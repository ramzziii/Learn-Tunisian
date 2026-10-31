import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { TimeWheelPicker } from '@/components/onboarding/TimeWheelPicker';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { ProfileAlreadyExistsError } from '@/lib/account/profileLimit';
import { useAuth } from '@/lib/auth/AuthContext';
import { requestNotificationPermission } from '@/lib/notifications/reminders';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

/**
 * Optional daily reminder — the last onboarding step, where the profile is
 * created. Notification permission is asked only after "Set reminder"; "Not
 * now" finishes without asking or scheduling anything. Profile can turn the
 * reminder on, off or change its time later.
 */
export default function ReminderSetup() {
  const { state, update, submit, reset } = useOnboarding();
  const { session } = useAuth();
  const { refreshProfiles, setActiveProfileId } = useActiveProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // One profile per account: if this account already has one (set up on
  // another device, or a second tab), offer the way to it, not a retry.
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

  const reminderHour = state.reminderHour ?? 18;
  const reminderMinute = state.reminderMinute ?? 0;

  const finish = async (reminderEnabled: boolean) => {
    if (!session) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const profile = await submit(session.user.id, { reminderEnabled });
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

  const setReminder = async () => {
    setError(null);
    const granted = await requestNotificationPermission();
    if (!granted) {
      setPermissionDenied(true);
      return;
    }
    await finish(true);
  };

  const continueToExistingProfile = async () => {
    await refreshProfiles();
    reset();
    router.replace('/');
  };

  let footer: React.ReactNode;
  if (hasExistingProfile) {
    footer = <Button label="Continue to my profile" onPress={continueToExistingProfile} />;
  } else if (permissionDenied) {
    footer = <Button label="Finish without a reminder" onPress={() => finish(false)} loading={isSubmitting} />;
  } else {
    footer = (
      <>
        <Button label="Set reminder" onPress={setReminder} loading={isSubmitting} />
        <Button label="Not now" variant="secondary" onPress={() => finish(false)} disabled={isSubmitting} />
      </>
    );
  }

  return (
    <OnboardingStepLayout
      title="Set a daily reminder"
      subtitle="Optional. Pick a time and we’ll send one friendly nudge a day. You can change or turn it off anytime in Profile."
      step={6}
      totalSteps={6}
      footer={
        <>
          {error ? <Text style={{ color: colors.error, marginBottom: spacing.sm }}>{error}</Text> : null}
          {footer}
        </>
      }
    >
      <TimeWheelPicker
        hour24={reminderHour}
        minute={reminderMinute}
        onChange={(hour24, minute) => update({ reminderHour: hour24, reminderMinute: minute })}
      />
      {permissionDenied ? (
        <Text style={{ fontSize: 14, color: colors.textPrimary, marginTop: spacing.md, lineHeight: 20 }}>
          Notifications are turned off for Learn Tunisian, so we can’t send a reminder. You can allow them in your
          device settings and turn the reminder on later in Profile.
        </Text>
      ) : null}
    </OnboardingStepLayout>
  );
}
