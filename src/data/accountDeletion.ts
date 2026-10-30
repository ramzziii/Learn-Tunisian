import { DELETE_CONFIRMATION_WORD } from '@/lib/account/deleteConfirmation';
import { supabase } from '@/lib/supabase/client';

export { DELETE_CONFIRMATION_WORD, isDeleteConfirmation } from '@/lib/account/deleteConfirmation';

export type AccountDeletionResult =
  | { ok: true; status: 'deleted' | 'already_deleted' }
  | { ok: false; message: string };

const RETRY_MESSAGE = 'Your account couldn’t be deleted right now. Check your connection and try again.';

/**
 * Asks the delete-account Edge Function to delete the signed-in account.
 * Sends only the typed confirmation: the server takes the account from the
 * session itself and refuses any other target. Only an explicit
 * "deleted" / "already_deleted" answer counts as success — any error, or an
 * answer it doesn't recognise, is a failure the user can safely retry.
 */
export async function requestAccountDeletion(): Promise<AccountDeletionResult> {
  let result;
  try {
    result = await supabase.functions.invoke('delete-account', { body: { confirm: DELETE_CONFIRMATION_WORD } });
  } catch {
    return { ok: false, message: RETRY_MESSAGE };
  }

  const { data, error } = result;
  if (error) {
    // A non-2xx reply carries the function's own message in its body;
    // supabase-js only exposes it on error.context.
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    const reply = (await context?.json?.().catch(() => null)) as { error?: { message?: string } } | null | undefined;
    return { ok: false, message: reply?.error?.message ?? RETRY_MESSAGE };
  }

  const status = (data as { status?: unknown } | null)?.status;
  if (status === 'deleted' || status === 'already_deleted') return { ok: true, status };
  return { ok: false, message: RETRY_MESSAGE };
}
