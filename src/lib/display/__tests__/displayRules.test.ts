// Display rules for Tunisian words (src/lib/display/displayRules.ts):
// - which grammatical form(s) to show first, from the learner's display
//   preference — never inventing a missing form or leaving a blank;
// - which script(s) to show, with the exemptions for exercises that test a
//   particular script;
// - the exercise prompt leads with the preferred form, while answer
//   checking still accepts every variant of the word.
import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';
import { getPromptVariant, isAnyVariantTransliterationMatch } from '@/lib/wordVariants';
import type { WordGroupWithVariants } from '@/types/models';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rules = require('@/lib/display/displayRules');

const pair = (): WordGroupWithVariants =>
  makeGroup('tired', {
    englishMeaning: 'tired',
    variants: [
      makeVariant('tired', { variantLabel: 'masculine', wordArabic: 'تعبان', transliteration: 'ta3ban' }),
      makeVariant('tired', { variantLabel: 'feminine', wordArabic: 'تعبانة', transliteration: 'ta3bana' }),
    ],
  });

const single = (): WordGroupWithVariants =>
  makeGroup('hello', {
    variants: [
      makeVariant('hello', { variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: 'aslema' }),
      makeVariant('hello', { variantLabel: 'also_heard', wordArabic: 'أهلا', transliteration: 'ahla' }),
    ],
  });

const labels = (variants: { variantLabel: string }[]) => variants.map((v) => v.variantLabel);

describe('which forms to show', () => {
  it('masculine preference: masculine first and alone, feminine one tap away', () => {
    const { shown, hidden } = rules.formsToShow(pair(), 'masculine');
    expect(labels(shown)).toEqual(['masculine']);
    expect(labels(hidden)).toEqual(['feminine']);
  });

  it('feminine preference: feminine first and alone, masculine one tap away', () => {
    const { shown, hidden } = rules.formsToShow(pair(), 'feminine');
    expect(labels(shown)).toEqual(['feminine']);
    expect(labels(hidden)).toEqual(['masculine']);
  });

  it('show both: both forms, nothing hidden', () => {
    const { shown, hidden } = rules.formsToShow(pair(), 'both');
    expect(labels(shown)).toEqual(['masculine', 'feminine']);
    expect(hidden).toEqual([]);
  });

  it('a word with one form shows that form whatever the preference — no toggle, no blank', () => {
    for (const form of ['masculine', 'feminine', 'both']) {
      const { shown, hidden } = rules.formsToShow(single(), form);
      expect(labels(shown)).toEqual(['primary']);
      expect(hidden).toEqual([]);
    }
  });

  it('only one gendered form available: shows it instead of the missing preferred one', () => {
    const onlyMasculine = makeGroup('x', { variants: [makeVariant('x', { variantLabel: 'masculine' })] });
    const { shown, hidden } = rules.formsToShow(onlyMasculine, 'feminine');
    expect(labels(shown)).toEqual(['masculine']);
    expect(hidden).toEqual([]);
  });

  it('knows whether a word has two forms', () => {
    expect(rules.hasTwoForms(pair())).toBe(true);
    expect(rules.hasTwoForms(single())).toBe(false);
  });

  it('labels forms in words, never as the learner’s identity', () => {
    expect(rules.formLabel('masculine')).toBe('Masculine form');
    expect(rules.formLabel('feminine')).toBe('Feminine form');
    expect(rules.formLabel('primary')).toBeNull();
  });
});

describe('the exercise prompt', () => {
  it('leads with the preferred form for two-form words', () => {
    for (let seed = 0; seed < 4; seed++) {
      expect(getPromptVariant(pair(), seed, 'masculine').variantLabel).toBe('masculine');
      expect(getPromptVariant(pair(), seed, 'feminine').variantLabel).toBe('feminine');
    }
  });

  it('show both (and no preference) keeps alternating, as before', () => {
    expect([0, 1].map((s) => getPromptVariant(pair(), s, 'both').variantLabel)).toEqual(['masculine', 'feminine']);
    expect([0, 1].map((s) => getPromptVariant(pair(), s).variantLabel)).toEqual(['masculine', 'feminine']);
  });

  it('a one-form word always prompts with its primary', () => {
    expect(getPromptVariant(single(), 0, 'feminine').variantLabel).toBe('primary');
  });

  it('answer checking accepts every variant, whatever the display preference', () => {
    // isAnyVariantTransliterationMatch takes no preference at all — both forms count.
    expect(isAnyVariantTransliterationMatch(pair(), 'ta3ban')).toBe(true);
    expect(isAnyVariantTransliterationMatch(pair(), 'ta3bana')).toBe(true);
    expect(isAnyVariantTransliterationMatch(single(), 'ahla')).toBe(true);
  });
});

describe('which script to show', () => {
  it('follows the preference', () => {
    expect(rules.scriptsToShow('both')).toEqual({ arabic: true, latin: true });
    expect(rules.scriptsToShow('arabic')).toEqual({ arabic: true, latin: false });
    expect(rules.scriptsToShow('latin')).toEqual({ arabic: false, latin: true });
  });

  it('an exercise that tests reading Arabic always shows Arabic', () => {
    expect(rules.scriptsToShow('latin', { alwaysShowArabic: true })).toEqual({ arabic: true, latin: true });
  });

  it('an exercise answered in transliteration always shows Latin', () => {
    expect(rules.scriptsToShow('arabic', { alwaysShowLatin: true })).toEqual({ arabic: true, latin: true });
  });

  it('never shows nothing: a missing script falls back to the one that exists', () => {
    expect(rules.scriptsToShow('arabic', { hasArabic: false })).toEqual({ arabic: false, latin: true });
    expect(rules.scriptsToShow('latin', { hasLatin: false })).toEqual({ arabic: true, latin: false });
  });

  it('defaults are both/both', () => {
    expect(rules.DEFAULT_DISPLAY_PREFERENCES).toEqual({ script: 'both', form: 'both' });
  });
});
