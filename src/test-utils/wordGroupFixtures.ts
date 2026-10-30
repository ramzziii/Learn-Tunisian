import type { WordGroupWithVariants, WordVariant } from '@/types/models';

/** A word variant with sensible defaults; `listenable` makes it pass the listening-quiz eligibility rules. */
export function makeVariant(
  groupId: string,
  overrides: Partial<WordVariant> & { listenable?: boolean } = {}
): WordVariant {
  const { listenable = false, ...rest } = overrides;
  return {
    id: `${groupId}-${rest.variantLabel ?? 'primary'}`,
    wordGroupId: groupId,
    variantLabel: 'primary',
    wordArabic: `عربي-${groupId}`,
    transliteration: `translit-${groupId}`,
    audioPath: listenable ? `${groupId}/primary.m4a` : null,
    notes: null,
    sortOrder: 0,
    nativeVerified: listenable,
    contentStatus: 'approved',
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    speakerName: null,
    dialectNotes: null,
    isNativeVoice: listenable,
    approvedBy: null,
    approvedAt: null,
    ...rest,
  } as WordVariant;
}

/** A word group with one primary variant unless `variants` is given. */
export function makeGroup(
  id: string,
  overrides: Partial<Omit<WordGroupWithVariants, 'variants'>> & { variants?: WordVariant[]; listenable?: boolean } = {}
): WordGroupWithVariants {
  const { variants, listenable = false, ...rest } = overrides;
  return {
    id,
    unitId: 'u1',
    lessonNumber: 1,
    englishMeaning: `meaning ${id}`,
    imageKeyword: null,
    imagePath: null,
    sortOrder: 0,
    contentStatus: 'approved',
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    variants: variants ?? [makeVariant(id, { listenable })],
    ...rest,
  } as WordGroupWithVariants;
}
