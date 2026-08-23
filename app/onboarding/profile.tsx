import { router } from 'expo-router';
import { Text } from 'react-native';

import { DateOfBirthField } from '@/components/onboarding/DateOfBirthField';
import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { TextField } from '@/components/ui/TextField';
import { COUNTRIES } from '@/constants/countries';
import { LANGUAGES } from '@/constants/languages';
import { spacing } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';
import type { LearningGoal, StartingProficiency } from '@/types/models';

const PROFICIENCY_OPTIONS: { value: StartingProficiency; label: string }[] = [
  { value: 'none', label: 'No Arabic at all' },
  { value: 'understands_some', label: "Understand some, can't speak" },
  { value: 'speaks_not_reads', label: "Speak but can't read" },
];

const GOAL_OPTIONS: { value: LearningGoal; label: string }[] = [
  { value: 'family', label: 'Connect with family' },
  { value: 'travel', label: 'Travel' },
  { value: 'heritage', label: 'Heritage/roots' },
  { value: 'fun', label: 'Just for fun' },
];

export default function ProfileSetup() {
  const { state, update } = useOnboarding();
  const isForChild = state.forWhom === 'child';

  const canContinue =
    state.name.trim().length > 0 &&
    state.dateOfBirth !== null &&
    state.nativeLanguage.trim().length > 0 &&
    state.country.trim().length > 0 &&
    state.startingProficiency !== null;

  return (
    <OnboardingStepLayout
      title={isForChild ? "Tell us about your child" : 'Tell us about you'}
      footer={
        <Button label="Continue" onPress={() => router.push('/onboarding/goal')} disabled={!canContinue} />
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
      <Autocomplete
        label="Mother tongue / native language"
        value={state.nativeLanguage}
        onChangeText={(nativeLanguage) => update({ nativeLanguage })}
        options={LANGUAGES}
        placeholder="Select or type a language"
      />
      <Autocomplete
        label="Country"
        value={state.country}
        onChangeText={(country) => update({ country })}
        options={COUNTRIES}
        placeholder="Select or type a country"
      />

      <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: spacing.sm }}>
        {isForChild ? "What's their starting level?" : "What's your starting level?"}
      </Text>
      {PROFICIENCY_OPTIONS.map((option) => (
        <SelectableCard
          key={option.value}
          title={option.label}
          selected={state.startingProficiency === option.value}
          onPress={() => update({ startingProficiency: option.value })}
        />
      ))}

      <Text style={{ fontSize: 14, fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Learning goal (optional)
      </Text>
      {GOAL_OPTIONS.map((option) => (
        <SelectableCard
          key={option.value}
          title={option.label}
          selected={state.learningGoal === option.value}
          onPress={() =>
            update({ learningGoal: state.learningGoal === option.value ? null : option.value })
          }
        />
      ))}
    </OnboardingStepLayout>
  );
}
