import { router } from 'expo-router';
import { Text } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { COUNTRIES } from '@/constants/countries';
import { FORM_EXPLANATION, FORM_OPTIONS, FORM_QUESTION } from '@/constants/displayPreferences';
import { LANGUAGES } from '@/constants/languages';
import { colors, spacing } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';
import type { LearningGoal, StartingProficiency } from '@/types/models';

const PROFICIENCY_OPTIONS: { value: StartingProficiency; label: string }[] = [
  { value: 'none', label: 'No Arabic at all' },
  { value: 'understands_some', label: "Understand some, can't speak" },
  { value: 'speaks_not_reads', label: "Speak but can't read" },
];

const GOAL_OPTIONS: { value: LearningGoal; label: string; subtitle: string }[] = [
  { value: 'family', label: 'Connect with family', subtitle: 'Talk with relatives in their own words' },
  { value: 'travel', label: 'Travel', subtitle: 'Get around and order like a local' },
  { value: 'heritage', label: 'Heritage/roots', subtitle: 'Reconnect with where your family is from' },
  { value: 'fun', label: 'Just for fun', subtitle: 'Curious about the language and culture' },
];

/** Profile setup, step 2: mother tongue, country, starting level, an
 * optional learning goal (tap a selected goal again to clear it), and which
 * grammatical form to show first (a display preference, default Show both). */
export default function PreferencesSetup() {
  const { state, update } = useOnboarding();

  const canContinue = state.nativeLanguage.trim().length > 0 && state.country.trim().length > 0;

  return (
    <OnboardingStepLayout
      title="Just a couple more things"
      subtitle="You can change any of this anytime in Settings."
      step={4}
      totalSteps={6}
      footer={<Button label="Continue" onPress={() => router.push('/onboarding/goal')} disabled={!canContinue} />}
    >
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
        What&apos;s your starting level?
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
          subtitle={option.subtitle}
          selected={state.learningGoal === option.value}
          onPress={() => update({ learningGoal: state.learningGoal === option.value ? null : option.value })}
        />
      ))}

      {/* A display preference, asked once here and changeable in Settings —
          never the learner's gender, never stored on the profile. */}
      <Text style={{ fontSize: 14, fontWeight: '600', marginTop: spacing.lg, marginBottom: spacing.xs }}>
        {FORM_QUESTION}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.sm }}>{FORM_EXPLANATION}</Text>
      {FORM_OPTIONS.map((option) => (
        <SelectableCard
          key={option.value}
          title={option.label}
          selected={state.formPreference === option.value}
          onPress={() => update({ formPreference: option.value })}
        />
      ))}
    </OnboardingStepLayout>
  );
}
