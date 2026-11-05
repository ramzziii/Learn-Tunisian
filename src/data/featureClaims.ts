import type { CountedFeature } from '@/lib/access/accessRules';
import { supabase } from '@/lib/supabase/client';

export type ClaimsByFeature = Partial<Record<CountedFeature, string[]>>;

/** This account's used free sample items (RLS returns only its own), by feature. */
export async function fetchMyClaims(): Promise<ClaimsByFeature> {
  const { data, error } = await supabase.from('feature_item_claims').select('feature, item_key');
  if (error) throw error;
  const claims: ClaimsByFeature = {};
  for (const row of (data ?? []) as { feature: CountedFeature; item_key: string }[]) {
    (claims[row.feature] ??= []).push(row.item_key);
  }
  return claims;
}

/** Uses one item on the server (claim_feature_item applies the cap; Premium is never capped). */
export async function claimFeatureItem(feature: CountedFeature, itemKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_feature_item', { p_feature: feature, p_item_key: itemKey });
  if (error) throw error;
  return data === true;
}

/** At sign-up: records the guest's used items on the new account (max 2 per feature; idempotent). */
export async function importGuestClaims(items: { feature: CountedFeature; item_key: string }[]): Promise<number> {
  if (items.length === 0) return 0;
  const { data, error } = await supabase.rpc('import_guest_feature_items', { p_items: items });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}
