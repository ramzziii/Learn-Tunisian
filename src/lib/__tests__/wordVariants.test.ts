import {
  getAlsoHeardVariants,
  getFeminineVariant,
  getMasculineVariant,
  getPrimaryVariant,
  getPromptVariant,
  hasGenderPair,
  isAnyVariantTransliterationMatch,
} from '@/lib/wordVariants';
import type { VariantLabel, WordGroupWithVariants, WordVariant } from '@/types/models';

function variant(label: VariantLabel, transliteration: string, overrides: Partial<WordVariant> = {}): WordVariant {
  return {
    id: `${label}-${transliteration}`,
    wordGroupId: 'group',
    variantLabel: label,
    wordArabic: `arabic-${transliteration}`,
    transliteration,
    audioPath: null,
    notes: null,
    sortOrder: 0,
    nativeVerified: false,
    ...overrides,
  };
}

function group(variants: WordVariant[]): WordGroupWithVariants {
  return {
    id: 'group',
    unitId: 'unit',
    lessonNumber: 1,
    englishMeaning: 'test',
    imageKeyword: null,
    imagePath: null,
    sortOrder: 0,
    variants,
  };
}

describe('variant lookups', () => {
  it('finds the primary variant when present', () => {
    const g = group([variant('primary', 'yalla')]);
    expect(getPrimaryVariant(g)?.transliteration).toBe('yalla');
  });

  it('returns null for a lookup that has no match', () => {
    const g = group([variant('primary', 'yalla')]);
    expect(getMasculineVariant(g)).toBeNull();
    expect(getFeminineVariant(g)).toBeNull();
  });

  it('collects multiple also_heard variants', () => {
    const g = group([
      variant('primary', 'yalla'),
      variant('also_heard', 'haya'),
      variant('also_heard', 'imshi'),
    ]);
    expect(getAlsoHeardVariants(g).map((v) => v.transliteration)).toEqual(['haya', 'imshi']);
  });

  it('hasGenderPair is true only when both masculine and feminine are present', () => {
    expect(hasGenderPair(group([variant('masculine', 'ena ji3an'), variant('feminine', 'ena ji3ana')]))).toBe(true);
    expect(hasGenderPair(group([variant('masculine', 'ena ji3an')]))).toBe(false);
    expect(hasGenderPair(group([variant('primary', 'yalla')]))).toBe(false);
  });
});

describe('getPromptVariant', () => {
  it('always uses the primary variant when one exists, regardless of the seed', () => {
    const g = group([variant('primary', 'yalla'), variant('also_heard', 'haya')]);
    expect(getPromptVariant(g, 0).transliteration).toBe('yalla');
    expect(getPromptVariant(g, 1).transliteration).toBe('yalla');
    expect(getPromptVariant(g, 99).transliteration).toBe('yalla');
  });

  it('alternates between masculine and feminine by seed parity when there is no primary', () => {
    const g = group([variant('masculine', 'ena ji3an'), variant('feminine', 'ena ji3ana')]);
    expect(getPromptVariant(g, 0).variantLabel).toBe('masculine');
    expect(getPromptVariant(g, 1).variantLabel).toBe('feminine');
    expect(getPromptVariant(g, 2).variantLabel).toBe('masculine');
    expect(getPromptVariant(g, 3).variantLabel).toBe('feminine');
  });
});

describe('isAnyVariantTransliterationMatch', () => {
  const g = group([
    variant('primary', 'yalla nemchiw'),
    variant('also_heard', 'haya nemchiw'),
  ]);

  it('matches the primary variant', () => {
    expect(isAnyVariantTransliterationMatch(g, 'yalla nemchiw')).toBe(true);
  });

  it('matches a non-primary (also_heard) variant just as validly', () => {
    expect(isAnyVariantTransliterationMatch(g, 'haya nemchiw')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isAnyVariantTransliterationMatch(g, '  YALLA nemchiw  ')).toBe(true);
  });

  it('rejects a genuinely wrong answer', () => {
    expect(isAnyVariantTransliterationMatch(g, 'kelb')).toBe(false);
  });

  it('rejects an empty submission rather than treating it as a match', () => {
    expect(isAnyVariantTransliterationMatch(g, '   ')).toBe(false);
  });

  it('matches either gender form for a masculine/feminine-only group', () => {
    const genderGroup = group([variant('masculine', 'ena ji3an'), variant('feminine', 'ena ji3ana')]);
    expect(isAnyVariantTransliterationMatch(genderGroup, 'ena ji3an')).toBe(true);
    expect(isAnyVariantTransliterationMatch(genderGroup, 'ena ji3ana')).toBe(true);
  });
});
