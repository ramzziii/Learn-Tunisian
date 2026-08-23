import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { recordConsent } from '@/data/consent';
import { createDailyGoalSettings, createProfile } from '@/data/profiles';
import { requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications/reminders';
import type { DailyGoalMinutes, LearningGoal, Profile, StartingProficiency } from '@/types/models';

export interface OnboardingState {
  forWhom: 'myself' | 'child' | null;
  consentGiven: boolean;
  name: string;
  /** ISO date string ("YYYY-MM-DD"), null until the user picks one. */
  dateOfBirth: string | null;
  nativeLanguage: string;
  country: string;
  startingProficiency: StartingProficiency | null;
  learningGoal: LearningGoal | null;
  dailyGoalMinutes: DailyGoalMinutes | null;
  reminderHour: number | null;
  reminderMinute: number | null;
}

const initialState: OnboardingState = {
  forWhom: null,
  consentGiven: false,
  name: '',
  dateOfBirth: null,
  nativeLanguage: '',
  country: '',
  startingProficiency: null,
  learningGoal: null,
  dailyGoalMinutes: null,
  reminderHour: null,
  reminderMinute: null,
};

interface OnboardingContextValue {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  reset: () => void;
  /** Persists the profile, consent record, and daily goal settings, then schedules the reminder. */
  submit: (accountId: string) => Promise<Profile>;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initialState);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      update: (patch) => setState((prev) => ({ ...prev, ...patch })),
      reset: () => setState(initialState),
      submit: async (accountId: string) => {
        const {
          name,
          dateOfBirth,
          nativeLanguage,
          country,
          startingProficiency,
          learningGoal,
          dailyGoalMinutes,
          reminderHour,
          reminderMinute,
          forWhom,
        } = state;

        if (!name || !dateOfBirth || !nativeLanguage || !country || !startingProficiency) {
          throw new Error('Missing required profile fields');
        }
        if (!dailyGoalMinutes || reminderHour === null || reminderMinute === null) {
          throw new Error('Missing daily goal / reminder settings');
        }

        const profile = await createProfile({
          accountId,
          name,
          dateOfBirth,
          nativeLanguage,
          country,
          startingProficiency,
          learningGoal,
        });

        await recordConsent(accountId, profile.id, forWhom === 'child');

        const reminderTime = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;
        await createDailyGoalSettings(profile.id, dailyGoalMinutes, reminderTime);

        // Notifications are requested here, at the point the reminder time is
        // set — not bundled into earlier onboarding steps — for both tracks;
        // a parent grants it on a kid profile's behalf just like any other
        // profile setting.
        const granted = await requestNotificationPermission();
        if (granted) {
          await scheduleDailyReminder(profile.id, `${reminderHour}:${reminderMinute}`);
        }

        return profile;
      },
    }),
    [state]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}
