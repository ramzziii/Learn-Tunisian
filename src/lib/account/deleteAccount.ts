import { requestAccountDeletion } from '@/data/accountDeletion';
import { clearLocalAccountData } from '@/lib/account/localAccountCleanup';
import { supabase } from '@/lib/supabase/client';

/**
 * Deletes the signed-in account, then tidies this device:
 * 1. the server deletes the account (supabase/functions/delete-account);
 * 2. only once it says so: this account's local data is cleared and the
 *    session is dropped locally (the Auth user no longer exists, so there's
 *    no server session to sign out of).
 * On a server failure nothing local is touched and the user stays signed
 * in, so they can simply try again.
 */
export async function completeAccountDeletion({
  profileIds,
  wasAdmin,
}: {
  profileIds: string[];
  wasAdmin: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await requestAccountDeletion();
  if (!result.ok) return result;

  await clearLocalAccountData({ profileIds, wasAdmin });
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The account is gone either way; a stale local session can't be used.
  }
  return { ok: true };
}
