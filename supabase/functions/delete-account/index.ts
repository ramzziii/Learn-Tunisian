// In-app account deletion (Profile → Account → Delete account).
//
// The request handling and the order of steps live in handler.ts (tested
// under Jest); this file wires it to Supabase with the service role, whose
// key comes only from the function's environment (set automatically by
// Supabase) and never reaches the app:
// - the caller's JWT is verified with Supabase Auth; its user id is the only
//   account this can delete;
// - the account's private files are listed with account_storage_objects
//   (0022) and removed through the Storage API;
// - delete_account_data (0022) deletes the account's rows and anonymizes
//   what's kept;
// - the Auth user is hard-deleted last with the Admin API.
// See docs/account-deletion.md.
//
// Deploy: supabase functions deploy delete-account
// No secrets to set — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided
// by the platform.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { createDeleteAccountHandler } from './handler.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isUserNotFound = (error: { code?: string; status?: number; message?: string }) =>
  error.code === 'user_not_found' || /user.*not.*found|does not exist/i.test(error.message ?? '');

Deno.serve(
  createDeleteAccountHandler({
    getUser: async (token) => {
      const { data, error } = await service.auth.getUser(token);
      if (error) return { error: isUserNotFound(error) ? 'user_not_found' : 'invalid' };
      return data.user ? { userId: data.user.id } : { error: 'invalid' };
    },
    listStorageObjects: async (accountId) => {
      const { data, error } = await service.rpc('account_storage_objects', { p_account_id: accountId });
      if (error) throw error;
      return (data ?? []) as { bucket: string; name: string }[];
    },
    removeStorageObjects: async (bucket, names) => {
      const { error } = await service.storage.from(bucket).remove(names);
      if (error) throw error;
    },
    deleteAccountData: async (accountId) => {
      const { data, error } = await service.rpc('delete_account_data', { p_account_id: accountId });
      if (error) throw error;
      return { accountDeleted: Boolean((data as { account_deleted?: boolean } | null)?.account_deleted) };
    },
    deleteAuthUser: async (accountId) => {
      const { error } = await service.auth.admin.deleteUser(accountId, false);
      if (!error) return 'deleted';
      if (isUserNotFound(error)) return 'not_found';
      throw error;
    },
    log: (message, error) => console.error(message, error),
  })
);
