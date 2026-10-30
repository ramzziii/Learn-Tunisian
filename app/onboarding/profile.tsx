import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { formatDateOfBirth } from '@/lib/age';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

/**
 * Profile setup, step 1: name, plus the date of birth already entered at the
 * age gate — shown, never asked for again here. If that in-memory date was
 * lost (the app restarted between sign-up and now), the learner confirms it
 * on the age gate again rather than on a second picker here.
 */
export default function ProfileSetup() {
  const { state, update } = useOnboarding();
  const hasDateOfBirth = state.dateOfBirth !== null;
  const canContinue = state.name.trim().length > 0 && hasDateOfBirth;

  return (
    <OnboardingStepLayout
      title="Tell us about you"
      step={3}
      totalSteps={5}
      footer={
        <Button label="Continue" onPress={() => router.push('/onboarding/preferences')} disabled={!canContinue} />
      }
    >
      <TextField label="Name" value={state.name} onChangeText={(name) => update({ name })} placeholder="Your name" />

      <Text style={styles.label}>Date of birth</Text>
      {state.dateOfBirth ? (
        <View style={styles.readOnly}>
          <Text style={styles.readOnlyText}>{formatDateOfBirth(state.dateOfBirth)}</Text>
        </View>
      ) : (
        <Button label="Confirm your date of birth" variant="secondary" onPress={() => router.push('/onboarding/age')} />
      )}
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  readOnly: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    backgroundColor: colors.background,
  },
  readOnlyText: { fontSize: 16, color: colors.textSecondary },
});
