import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { recordConsent } from '@/data/consent';
import { saveDisplayPreferences } from '@/data/displayPreferences';
import { createDailyGoalSettings, createProfile } from '@/data/profiles';
import { isAdult } from '@/lib/age';
import { requestNotificationPermission, scheduleDailyReminder } from '@/lib/notifications/reminders';
import type { DailyGoalMinutes, FormPreference, LearningGoal, Profile, StartingProficiency } from '@/types/models';

/**
 * Draft onboarding answers, held in memory only (never AsyncStorage, never
 * sent anywhere) until submit() creates the profile. The date of birth is
 * entered once, at the pre-signup age gate (app/onboarding/age.tsx), and only
 * stored here for someone 18 or older.
 */
export interface OnboardingState {
  consentGiven: boolean;
  name: string;
  /** ISO date string ("YYYY-MM-DD") from the age gate; null until then. */
  dateOfBirth: string | null;
  nativeLanguage: string;
  country: string;
  startingProficiency: StartingProficiency | null;
  learningGoal: LearningGoal | null;
  /** Which form of two-form words to show first — a display preference, not the learner's gender. */
  formPreference: FormPreference;
  dailyGoalMinutes: DailyGoalMinutes | null;
  reminderHour: number | null;
  reminderMinute: number | null;
}

const initialState: OnboardingState = {
  consentGiven: false,
  name: '',
  dateOfBirth: null,
  nativeLanguage: '',
  country: '',
  // Pre-selected so both preference screens can be blown through with a
  // single tap if the user doesn't want to think about it yet — still fully
  // editable, and editable again later in Settings.
  startingProficiency: 'none',
  learningGoal: null,
  formPreference: 'both',
  dailyGoalMinutes: 10,
  // Pre-selected to match the 6:00 PM default the reminder-time picker
  // already *displays* (see app/onboarding/goal.tsx) — previously these
  // stayed null until the user actually touched the picker, so finishing
  // onboarding without changing the time silently failed submit()'s
  // "missing reminder settings" check even though the screen showed a time.
  reminderHour: 18,
  reminderMinute: 0,
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
          formPreference,
          dailyGoalMinutes,
          reminderHour,
          reminderMinute,
          consentGiven,
        } = state;

        if (!consentGiven) {
          throw new Error('Terms and Privacy consent has not been given');
        }
        // Defence in depth: the age gate already stopped an under-18 here.
        if (!dateOfBirth || !isAdult(dateOfBirth)) {
          throw new Error('A date of birth showing the user is 18 or older is required');
        }
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

        await recordConsent(accountId, profile.id);

        const reminderTime = `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}:00`;
        await createDailyGoalSettings(profile.id, dailyGoalMinutes, reminderTime);

        // Display preference only. "Show both" is the default with no row,
        // so there's nothing to save for it. A failed save doesn't fail
        // onboarding: the profile is set up, and Settings can change it.
        if (formPreference !== 'both') {
          await saveDisplayPreferences(profile.id, { script: 'both', form: formPreference }).catch(() => undefined);
        }

        // Notifications are requested here, at the point the reminder time is
        // set — not bundled into earlier onboarding steps.
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
