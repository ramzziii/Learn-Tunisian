import { getFeminineVariant, getMasculineVariant, getPrimaryVariant } from '@/lib/wordVariants';
import type { DisplayPreferences, FormPreference, ScriptPreference, VariantLabel, WordGroupWithVariants, WordVariant } from '@/types/models';

/**
 * How Tunisian words are shown, from the learner's display preferences
 * (0023). Display only: answer checking never looks at these.
 */

/** No saved row (every existing learner) means this. */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = { script: 'both', form: 'both' };

export const SCRIPT_PREFERENCES: readonly ScriptPreference[] = ['arabic', 'latin', 'both'];
export const FORM_PREFERENCES: readonly FormPreference[] = ['masculine', 'feminine', 'both'];

/** True when the word has both a masculine and a feminine form. */
export function hasTwoForms(group: WordGroupWithVariants): boolean {
  return getMasculineVariant(group) !== null && getFeminineVariant(group) !== null;
}

/** "Masculine form" / "Feminine form" — the form, never the learner. Null for non-gendered variants. */
export function formLabel(label: VariantLabel): string | null {
  if (label === 'masculine') return 'Masculine form';
  if (label === 'feminine') return 'Feminine form';
  return null;
}

/**
 * Which form(s) of a word to show straight away, and which are one tap
 * ("Show the other form") away. Two-form words follow the preference
 * (masculine, feminine, or both — masculine first). Anything else shows
 * its one main form: the primary, or the only gendered form there is.
 * Never invents a missing form or leaves a blank.
 */
export function formsToShow(group: WordGroupWithVariants, form: FormPreference): { shown: WordVariant[]; hidden: WordVariant[] } {
  const masculine = getMasculineVariant(group);
  const feminine = getFeminineVariant(group);
  if (masculine && feminine) {
    if (form === 'masculine') return { shown: [masculine], hidden: [feminine] };
    if (form === 'feminine') return { shown: [feminine], hidden: [masculine] };
    return { shown: [masculine, feminine], hidden: [] };
  }
  const main = getPrimaryVariant(group) ?? masculine ?? feminine ?? group.variants[0] ?? null;
  return { shown: main ? [main] : [], hidden: [] };
}

/**
 * Which script(s) to show. `alwaysShowArabic` / `alwaysShowLatin` are for
 * exercises that test that script (reading match / typing). If the
 * preferred script is missing for a piece of text, the other is shown
 * rather than nothing.
 */
export function scriptsToShow(
  script: ScriptPreference,
  options: { alwaysShowArabic?: boolean; alwaysShowLatin?: boolean; hasArabic?: boolean; hasLatin?: boolean } = {}
): { arabic: boolean; latin: boolean } {
  const { alwaysShowArabic = false, alwaysShowLatin = false, hasArabic = true, hasLatin = true } = options;
  let arabic = (script !== 'latin' || alwaysShowArabic) && hasArabic;
  let latin = (script !== 'arabic' || alwaysShowLatin) && hasLatin;
  if (!arabic && !latin) {
    arabic = hasArabic;
    latin = !hasArabic && hasLatin;
  }
  return { arabic, latin };
}

/** Reads a stored value, falling back to the default for anything unexpected. */
export function parseDisplayPreferences(row: { script?: unknown; form?: unknown } | null | undefined): DisplayPreferences {
  return {
    script: SCRIPT_PREFERENCES.includes(row?.script as ScriptPreference) ? (row!.script as ScriptPreference) : DEFAULT_DISPLAY_PREFERENCES.script,
    form: FORM_PREFERENCES.includes(row?.form as FormPreference) ? (row!.form as FormPreference) : DEFAULT_DISPLAY_PREFERENCES.form,
  };
}

/** The one variant to show where there's room for one: the preferred form, or the word's main form. */
export function preferredVariant(group: WordGroupWithVariants, form: FormPreference): WordVariant | null {
  return formsToShow(group, form).shown[0] ?? null;
}
