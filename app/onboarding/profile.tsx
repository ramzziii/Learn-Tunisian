import { router } from 'expo-router';
import { Text } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { TextField } from '@/components/ui/TextField';
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
    Number(state.age) > 0 &&
    Number(state.age) < 120 &&
    state.nativeLanguage.trim().length > 0 &&
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
      <TextField
        label="Age"
        value={state.age}
        onChangeText={(age) => update({ age: age.replace(/[^0-9]/g, '') })}
        keyboardType="number-pad"
        placeholder="Age"
      />
      <TextField
        label="Mother tongue / native language"
        value={state.nativeLanguage}
        onChangeText={(nativeLanguage) => update({ nativeLanguage })}
        placeholder="e.g. English"
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
