import type { WordGroupWithVariants, WordVariant } from '@/types/models';

export function getPrimaryVariant(group: WordGroupWithVariants): WordVariant | null {
  return group.variants.find((v) => v.variantLabel === 'primary') ?? null;
}

export function getMasculineVariant(group: WordGroupWithVariants): WordVariant | null {
  return group.variants.find((v) => v.variantLabel === 'masculine') ?? null;
}

export function getFeminineVariant(group: WordGroupWithVariants): WordVariant | null {
  return group.variants.find((v) => v.variantLabel === 'feminine') ?? null;
}

export function getAlsoHeardVariants(group: WordGroupWithVariants): WordVariant[] {
  return group.variants.filter((v) => v.variantLabel === 'also_heard');
}

export function hasGenderPair(group: WordGroupWithVariants): boolean {
  return getMasculineVariant(group) !== null && getFeminineVariant(group) !== null;
}

/**
 * The variant to use as the default prompt/target for teaching and quizzing
 * this group. Every word_group has either exactly one 'primary' variant, or
 * both a 'masculine' and a 'feminine' one (enforced in the DB by
 * check_word_group_has_primary_or_gender_pair) — for the latter case, this
 * alternates between the two based on `alternateSeed` so exercises stay
 * gender-neutral across a session rather than always leading with one form.
 * The "You might also hear" / gender-pair callout (VariantCallout) always
 * shows both forms regardless of which one was picked here as the prompt.
 */
export function getPromptVariant(group: WordGroupWithVariants, alternateSeed: number): WordVariant {
  const primary = getPrimaryVariant(group);
  if (primary) return primary;

  const masculine = getMasculineVariant(group);
  const feminine = getFeminineVariant(group);
  if (masculine && feminine) {
    return alternateSeed % 2 === 0 ? masculine : feminine;
  }

  // Unreachable given the DB constraint, but keeps this total rather than throwing.
  return group.variants[0];
}

/**
 * Accepts any variant in the group as a correct answer — e.g. typing the
 * also_heard form, or either gender form, both count, not just whichever
 * variant happened to be the exercise's prompt.
 */
export function isAnyVariantTransliterationMatch(group: WordGroupWithVariants, input: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return group.variants.some((v) => v.transliteration.trim().toLowerCase() === normalized);
}
