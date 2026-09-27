import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { colors, radii, spacing } from '@/constants/theme';
import { KIDS_SECTION_ENABLED } from '@/constants/features';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

export default function WhoIsThisFor() {
  const { update } = useOnboarding();
  const { profiles } = useActiveProfile();

  // Where either path below sends the user next: the trial/pricing preview
  // only makes sense the first time an account creates a profile, not when
  // an existing user is adding a second one.
  const nextRoute = profiles.length === 0 ? '/onboarding/plans' : '/onboarding/consent';

  const choose = (forWhom: 'myself' | 'child') => {
    update({ forWhom });
    router.push(nextRoute);
  };

  useEffect(() => {
    // Kids section is hidden for now (see src/constants/features.ts) — this
    // screen's only real choice is unreachable, so skip straight through
    // rather than showing a single-button "choice." Nothing here is
    // deleted; flip the flag back on and this screen behaves as before.
    if (!KIDS_SECTION_ENABLED) {
      update({ forWhom: 'myself' });
      router.replace(nextRoute);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!KIDS_SECTION_ENABLED) return <LoadingScreen />;

  return (
    <ScreenContainer>
      <BackButton />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.eyebrow}>Ahla! Welcome to</Text>
        <Text style={styles.title}>Learn Tunisian</Text>
        <Text style={styles.subtitle}>Who is this for?</Text>

        <Pressable style={styles.option} onPress={() => choose('myself')}>
          <Text style={styles.optionEmoji}>🙋</Text>
          <Text style={styles.optionLabel}>Myself</Text>
        </Pressable>

        <Pressable style={styles.option} onPress={() => choose('child')}>
          <Text style={styles.optionEmoji}>🧒</Text>
          <Text style={styles.optionLabel}>My child</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  title: { fontSize: 34, fontWeight: '800', color: colors.primaryDark, textAlign: 'center', marginBottom: spacing.xl },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  optionEmoji: { fontSize: 32 },
  optionLabel: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
});
