import type { FormPreference, ScriptPreference } from '@/types/models';

/**
 * Wording for the display preferences, shared by onboarding and Settings.
 * The form setting is about which grammatical form to show first — it is
 * never a question about the learner's gender.
 */
export const FORM_QUESTION = 'Which form would you like to practice by default?';

export const FORM_EXPLANATION =
  'Some Tunisian Arabic words and phrases change depending on the form used. This choice controls which form we show first; it does not define your gender.';

export const FORM_OPTIONS: { value: FormPreference; label: string }[] = [
  { value: 'masculine', label: 'Masculine' },
  { value: 'feminine', label: 'Feminine' },
  { value: 'both', label: 'Show both' },
];

export const SCRIPT_OPTIONS: { value: ScriptPreference; label: string }[] = [
  { value: 'arabic', label: 'Arabic' },
  { value: 'latin', label: 'Latin' },
  { value: 'both', label: 'Both' },
];

/** The Settings preview's sample: "tired", which changes with the form. */
export const PREVIEW_SAMPLE = {
  meaning: 'tired',
  masculine: { arabic: 'تعبان', latin: 'ta3ban' },
  feminine: { arabic: 'تعبانة', latin: 'ta3bana' },
} as const;
