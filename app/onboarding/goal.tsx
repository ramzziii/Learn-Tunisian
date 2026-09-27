import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { OnboardingStepLayout } from '@/components/onboarding/OnboardingStepLayout';
import { TimeWheelPicker } from '@/components/onboarding/TimeWheelPicker';
import { Button } from '@/components/ui/Button';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { colors, spacing } from '@/constants/theme';
import { fetchLessonMap } from '@/data/content';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { recommendNextStep } from '@/lib/nextStepRecommendation';
import { useOnboarding } from '@/lib/onboarding/OnboardingContext';
import type { DailyGoalMinutes } from '@/types/models';

const GOAL_OPTIONS: DailyGoalMinutes[] = [5, 10, 15];

export default function DailyGoalSetup() {
  const { state, update, submit, reset } = useOnboarding();
  const { session } = useAuth();
  const { refreshProfiles, setActiveProfileId } = useActiveProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Drop the user straight into a real lesson instead of the lesson map,
      // so the very first thing they do after onboarding is learn something —
      // falls back to /home if there's nothing to recommend yet.
      const firstLesson = await fetchLessonMap(profile.id)
        .then((units) => {
          const allLessons = units.flatMap((u) => u.lessons);
          const recommendation = recommendNextStep(allLessons, 0);
          return (recommendation?.type === 'lesson' ? recommendation.lesson : null) ?? allLessons[0] ?? null;
        })
        .catch(() => null);
      router.replace(firstLesson ? `/lesson/${firstLesson.id}` : '/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OnboardingStepLayout
      title="Set a daily goal"
      subtitle="You can change this anytime from settings."
      step={4}
      totalSteps={4}
      footer={
        <>
          {error ? <Text style={{ color: colors.error, marginBottom: spacing.sm }}>{error}</Text> : null}
          <Button label="Finish setup" onPress={handleFinish} disabled={!canFinish} loading={isSubmitting} />
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
