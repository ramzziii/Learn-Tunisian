// The effective Premium entitlement every access decision is asked with
// (item allowances themselves live in src/lib/access — see accessRules.test).
import { resolveEffectivePremium } from '@/lib/premium/access';

describe('effective entitlement (admins always have Premium, with a free-plan preview)', () => {
  it('admin: Premium by default even though their profile is not paid', () => {
    expect(resolveEffectivePremium({ profileIsPremium: false, isAdmin: true, adminPreview: 'premium' })).toBe(true);
  });

  it('admin previewing the free plan is treated exactly like a free learner', () => {
    expect(resolveEffectivePremium({ profileIsPremium: false, isAdmin: true, adminPreview: 'free' })).toBe(false);
    expect(resolveEffectivePremium({ profileIsPremium: true, isAdmin: true, adminPreview: 'free' })).toBe(false);
  });

  it('non-admins get their profile flag; a stored preview can never grant them Premium', () => {
    expect(resolveEffectivePremium({ profileIsPremium: false, isAdmin: false, adminPreview: 'premium' })).toBe(false);
    expect(resolveEffectivePremium({ profileIsPremium: true, isAdmin: false, adminPreview: 'free' })).toBe(true);
  });
});
