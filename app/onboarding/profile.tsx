import { router } from 'expo-router';

import { DateOfBirthField } from '@/components/onboarding/DateOfBirthField';
import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';

export default function ProfileSetup() {
  const { state, update } = useOnboarding();
  const isForChild = state.forWhom === 'child';

  const canContinue = state.name.trim().length > 0 && state.dateOfBirth !== null;

  return (
    <OnboardingStepLayout
      title={isForChild ? "Tell us about your child" : 'Tell us about you'}
      step={2}
      totalSteps={4}
      footer={
        <Button label="Continue" onPress={() => router.push('/onboarding/preferences')} disabled={!canContinue} />
      }
    >
      <TextField
        label="Name"
        value={state.name}
        onChangeText={(name) => update({ name })}
        placeholder={isForChild ? "Child's name" : 'Your name'}
      />
      <DateOfBirthField
        label="Date of birth"
        value={state.dateOfBirth}
        onChange={(dateOfBirth) => update({ dateOfBirth })}
      />
    </OnboardingStepLayout>
  );
}
