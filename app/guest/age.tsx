import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { colors, radii, spacing } from '@/constants/theme';
import { blockAgeRetry, isAgeRetryBlocked } from '@/lib/age/retryBlock';
import { useGuest } from '@/lib/guest/GuestContext';

/**
 * Before the guest preview: "Are you 18 or older?" — a yes/no answer, no date
 * of birth. "No" (or the device's retry block) shows the adults-only message
 * and the preview doesn't start. Creating an account still uses the full
 * date-of-birth gate (app/onboarding/age.tsx).
 */
export default function GuestAgeConfirm() {
  const { startGuest } = useGuest();
  const [state, setState] = useState<'checking' | 'ask' | 'adults-only'>('checking');

  useEffect(() => {
    isAgeRetryBlocked()
      .then((blocked) => setState(blocked ? 'adults-only' : 'ask'))
      .catch(() => setState('ask'));
  }, []);

  if (state === 'checking') return <LoadingScreen />;

  if (state === 'adults-only') {
    return (
      <OnboardingStepLayout
        title="Thanks for your interest!"
        subtitle="Learn Tunisian is only for adults (18 and over), so the preview isn't available. Please come back later."
        footer={<Button label="Back to start" variant="secondary" onPress={() => router.replace('/welcome')} />}
      >
        <View style={styles.note}>
          <Text style={styles.noteText}>🌱 We&apos;d love to help you learn Tunisian Arabic when you&apos;re 18.</Text>
        </View>
      </OnboardingStepLayout>
    );
  }

  const yes = async () => {
    await startGuest();
    router.replace('/home');
  };
  const no = async () => {
    await blockAgeRetry().catch(() => undefined);
    setState('adults-only');
  };

  return (
    <OnboardingStepLayout
      title="Are you 18 or older?"
      subtitle="Learn Tunisian is for adults. Try a few lessons first — nothing is saved to an account, and you can create one any time."
      footer={
        <>
          <Button label="Yes, I'm 18 or older" onPress={yes} />
          <Button label="No" variant="secondary" onPress={no} />
        </>
      }
    >
      <View />
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  note: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md },
  noteText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
});
