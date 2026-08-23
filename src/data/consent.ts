import { supabase } from '@/lib/supabase/client';
import { mapConsentRecord } from '@/data/mappers';
import type { ConsentRecordRow } from '@/types/database';
import type { ConsentRecord } from '@/types/models';

const TERMS_VERSION = 'v1';

export async function recordConsent(
  accountId: string,
  profileId: string,
  isForChild: boolean
): Promise<ConsentRecord> {
  const { data, error } = await supabase
    .from('consent_records')
    .insert({
      account_id: accountId,
      profile_id: profileId,
      is_for_child: isForChild,
      terms_version: TERMS_VERSION,
    })
    .select('*')
    .single<ConsentRecordRow>();
  if (error) throw error;
  return mapConsentRecord(data);
}
