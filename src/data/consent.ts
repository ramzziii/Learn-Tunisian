import { supabase } from '@/lib/supabase/client';
import { mapConsentRecord } from '@/data/mappers';
import type { ConsentRecordRow } from '@/types/database';
import type { ConsentRecord } from '@/types/models';

const TERMS_VERSION = 'v1';

/** Records the adult's own acceptance of the Terms and Privacy Policy.
 * consent_records.is_for_child is a required column left from the removed
 * kids track; it is always false now. */
export async function recordConsent(accountId: string, profileId: string): Promise<ConsentRecord> {
  const { data, error } = await supabase
    .from('consent_records')
    .insert({
      account_id: accountId,
      profile_id: profileId,
      is_for_child: false,
      terms_version: TERMS_VERSION,
    })
    .select('*')
    .single<ConsentRecordRow>();
  if (error) throw error;
  return mapConsentRecord(data);
}
