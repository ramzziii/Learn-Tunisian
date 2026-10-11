import type { VariantLabel } from '@/types/models';

interface VariantLike {
  variantLabel: VariantLabel;
}

/**
 * Mirrors check_word_group_has_primary_or_gender_pair exactly
 * (supabase/migrations/0003_word_variants.sql) — a client-side precheck so
 * the admin UI can block an invalid save before round-tripping to the DB's
 * deferred constraint trigger.
 */
export function hasPrimaryOrGenderPair(variants: VariantLike[]): boolean {
  const hasPrimary = variants.some((v) => v.variantLabel === 'primary');
  const hasMasculine = variants.some((v) => v.variantLabel === 'masculine');
  const hasFeminine = variants.some((v) => v.variantLabel === 'feminine');
  return hasPrimary || (hasMasculine && hasFeminine);
}

interface VariantWithStatus extends VariantLike {
  contentStatus: string;
}

/**
 * Same rule, but over only the variants a normal user would actually see
 * (content_status === 'approved'). The DB trigger has no concept of
 * content_status, so it can't catch "this group is approved, but its only
 * approved variant just got demoted to draft" — this is the one invariant
 * only the app layer can enforce, so it must run before letting a
 * word_group's own content_status move to 'approved'.
 */
export function hasApprovedPrimaryOrGenderPair(variants: VariantWithStatus[]): boolean {
  return hasPrimaryOrGenderPair(variants.filter((v) => v.contentStatus === 'approved'));
}
