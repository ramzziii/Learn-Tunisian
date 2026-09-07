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

// Arabic diacritics (harakat, tanween, sukoon), tatweel, and other combining
// marks — an STT transcript is very unlikely to include these even when the
// spoken word matches exactly, so they're stripped before comparing rather
// than treated as a mismatch.
const ARABIC_DIACRITIC_OR_TATWEEL = /[ؐ-ؚـً-ٰٟۖ-ۭ]/g;
// Collapses the various hamza-on-alef forms (أ إ آ) to a bare alef, and alef
// maksura (ى) to yaa — common, meaning-preserving spelling variation that
// speech-to-text output and hand-typed content don't always agree on.
const ARABIC_ALEF_VARIANTS = /[أإآ]/g;
const ARABIC_ALEF_MAKSURA = /ى/g;

function normalizeArabicForMatch(text: string): string {
  return text
    .replace(ARABIC_DIACRITIC_OR_TATWEEL, '')
    .replace(ARABIC_ALEF_VARIANTS, 'ا')
    .replace(ARABIC_ALEF_MAKSURA, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, '') // punctuation (Whisper sometimes adds a trailing "؟" or "."), keep letters/digits/spaces
    .trim()
    .replace(/\s+/g, ' ');
}

/** Levenshtein edit distance, used only to tolerate minor STT noise (a dropped short vowel sound, a mis-heard adjacent letter) — not a general fuzzy-search primitive. */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(distances[i - 1][j] + 1, distances[i][j - 1] + 1, distances[i - 1][j - 1] + cost);
    }
  }
  return distances[rows - 1][cols - 1];
}

/** 1.0 for an exact match, 0.0 for completely different strings. */
function similarityRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

// A transcript doesn't need to match a variant's spelling character-for-
// character to count — speech recognition on Tunisian Derja specifically has
// no dedicated support from Whisper (the model backing this app's STT), so
// some tolerance for minor noise avoids marking a genuinely correct
// pronunciation wrong over a recognition quirk rather than an actual mistake.
const SPEECH_MATCH_THRESHOLD = 0.75;

/**
 * Accepts any variant in the group as a correct spoken answer (mirroring
 * isAnyVariantTransliterationMatch's same any-variant-counts rule), matching
 * an STT transcript against each variant's Arabic spelling with light fuzzy
 * tolerance rather than requiring an exact character match.
 */
export function isAnyVariantSpeechMatch(group: WordGroupWithVariants, transcript: string): boolean {
  const normalizedTranscript = normalizeArabicForMatch(transcript);
  if (normalizedTranscript.length === 0) return false;

  return group.variants.some((variant) => {
    const normalizedVariant = normalizeArabicForMatch(variant.wordArabic);
    if (normalizedVariant.length === 0) return false;
    return similarityRatio(normalizedTranscript, normalizedVariant) >= SPEECH_MATCH_THRESHOLD;
  });
}
