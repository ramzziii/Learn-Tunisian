/**
 * The effective Premium entitlement. Who may open what (guest / free /
 * Premium item allowances, Talk, practice scope) lives in src/lib/access —
 * this file only answers "does this learner have Premium right now?".
 *
 * The `isPremium` from usePremium() (src/lib/premium/PremiumContext.tsx):
 * admins always have Premium (with an optional free-plan preview), everyone
 * else gets `profiles.is_premium`. There is no purchase provider wired into
 * the app yet (see app/onboarding/plans.tsx), so nothing in the app ever
 * flips that flag — it's set server-side only.
 */

export type AdminPremiumPreview = 'premium' | 'free';

/**
 * Admins (accounts.is_admin, which only another admin can grant — see
 * 0009_admin_content_management.sql) always have full Premium access, and can
 * switch to previewing the free plan from their profile to see exactly what
 * free learners see. Everyone else gets their profile's is_premium.
 */
export function resolveEffectivePremium(input: {
  profileIsPremium: boolean;
  isAdmin: boolean;
  adminPreview: AdminPremiumPreview;
}): boolean {
  if (input.isAdmin) return input.adminPreview === 'premium';
  return input.profileIsPremium;
}
