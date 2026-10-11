import { hasApprovedPrimaryOrGenderPair, hasPrimaryOrGenderPair } from '@/lib/admin/wordGroupValidation';
import type { VariantLabel } from '@/types/models';

function v(variantLabel: VariantLabel, contentStatus = 'approved') {
  return { variantLabel, contentStatus };
}

describe('hasPrimaryOrGenderPair', () => {
  it('is false for an empty list', () => {
    expect(hasPrimaryOrGenderPair([])).toBe(false);
  });

  it('is true with one primary variant', () => {
    expect(hasPrimaryOrGenderPair([v('primary')])).toBe(true);
  });

  it('is false with only a masculine variant', () => {
    expect(hasPrimaryOrGenderPair([v('masculine')])).toBe(false);
  });

  it('is true with both masculine and feminine', () => {
    expect(hasPrimaryOrGenderPair([v('masculine'), v('feminine')])).toBe(true);
  });

  it('ignores also_heard variants', () => {
    expect(hasPrimaryOrGenderPair([v('also_heard')])).toBe(false);
  });
});

describe('hasApprovedPrimaryOrGenderPair', () => {
  it('is false when the only primary is still draft', () => {
    expect(hasApprovedPrimaryOrGenderPair([v('primary', 'draft')])).toBe(false);
  });

  it('is true when the primary is approved', () => {
    expect(hasApprovedPrimaryOrGenderPair([v('primary', 'approved')])).toBe(true);
  });

  it('is false when a gender pair exists but only one side is approved', () => {
    expect(hasApprovedPrimaryOrGenderPair([v('masculine', 'approved'), v('feminine', 'draft')])).toBe(false);
  });

  it('is true when both sides of a gender pair are approved', () => {
    expect(hasApprovedPrimaryOrGenderPair([v('masculine', 'approved'), v('feminine', 'approved')])).toBe(true);
  });
});
