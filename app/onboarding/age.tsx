import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DateOfBirthField } from '@/components/onboarding/DateOfBirthField';
import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { isAdult } from '@/lib/age';
import { useAuth } from '@/lib/auth/AuthContext';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

/**
 * The 18+ age gate — the first onboarding step, before an account exists.
 * Self-declared: it checks the date entered; it does not verify anyone's
 * real age.
 *
 * The date is held in this screen's own state until it passes. For someone
 * under 18 it is discarded on the spot: never written to onboarding state,
 * device storage, the network or logs, and no account is created. For an
 * adult it moves into onboarding memory (OnboardingContext) and is saved only
 * when the profile is created — profile setup shows it instead of asking
 * again.
 *
 * Also reached while signed in, if that in-memory date was lost (e.g. the app
 * restarted after email confirmation) before profile setup — then it returns
 * to profile setup instead of sign-up.
 */
export default function AgeGate() {
  const { session, signOut } = useAuth();
  const { update, reset } = useOnboarding();
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [isUnderage, setIsUnderage] = useState(false);
  const isSignedIn = !!session;

  useEffect(() => {
    // A fresh start before any account exists. Not when resuming signed in,
    // which must keep the consent already given.
    if (!isSignedIn) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    if (!dateOfBirth) return;
    if (!isAdult(dateOfBirth)) {
      setDateOfBirth(null);
      update({ dateOfBirth: null });
      setIsUnderage(true);
      return;
    }
    update({ dateOfBirth });
    if (isSignedIn) router.replace('/onboarding/profile');
    else router.push('/auth/sign-up');
  };

  if (isUnderage) {
    return (
      <OnboardingStepLayout
        title="Thanks for your interest!"
        subtitle="Learn Tunisian is only for adults (18 and over), so we can't set up an account for you. We haven't saved the date you entered."
        step={1}
        totalSteps={6}
        footer={
          isSignedIn ? (
            <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
          ) : (
            <Button label="Back to start" variant="secondary" onPress={() => router.replace('/welcome')} />
          )
        }
      >
        <View style={styles.note}>
          <Text style={styles.noteText}>🌱 Come back when you&apos;re 18 — we&apos;d love to help you learn Tunisian Arabic.</Text>
        </View>
      </OnboardingStepLayout>
    );
  }

  return (
    <OnboardingStepLayout
      title="When were you born?"
      subtitle="Learn Tunisian is for adults — you need to be 18 or older to use it. We use your date of birth only to check this and to set up your profile."
      step={1}
      totalSteps={6}
      footer={<Button label="Continue" onPress={handleContinue} disabled={!dateOfBirth} />}
    >
      <DateOfBirthField label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} />
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  note: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md },
  noteText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
});
