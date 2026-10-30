// delete-account request handling — no Deno/npm imports, so it runs under
// Jest (src/__tests__/functions/deleteAccountHandler.test.ts). index.ts
// wires it to Supabase with the service role.
//
// Deletes the CALLER's own account, and only that: the target is the user
// id of the verified JWT. A request body that names any target (user id,
// account id, profile id, email, admin flag…) is rejected outright.
//
// Order (three separate services, so NOT atomic — each step is safe to
// repeat, and the Auth user goes last so a retry can still authenticate):
//   1. storage — the account's private files (account_storage_objects →
//      Storage API remove);
//   2. database — delete_account_data (0022): deletes the account's rows and
//      removes its links from data that is kept;
//   3. auth — hard-delete the Auth user (Admin API).
// Success is reported only after step 3. A failure at any step returns
// 500 deletion_incomplete with the step, and later steps don't run.
// If the Auth user no longer exists (an earlier attempt finished but its
// response was lost), the request answers already_deleted and does nothing.

export interface StorageObject {
  bucket: string;
  name: string;
}

export interface DeleteAccountDeps {
  /** Verifies the JWT. 'user_not_found' = validly signed, but that user has already been deleted. */
  getUser: (token: string) => Promise<{ userId: string } | { error: 'invalid' | 'user_not_found' }>;
  listStorageObjects: (accountId: string) => Promise<StorageObject[]>;
  removeStorageObjects: (bucket: string, names: string[]) => Promise<void>;
  deleteAccountData: (accountId: string) => Promise<{ accountDeleted: boolean }>;
  deleteAuthUser: (accountId: string) => Promise<'deleted' | 'not_found'>;
  log?: (message: string, error?: unknown) => void;
}

const CONFIRMATION = 'DELETE';
const REMOVE_BATCH = 100;

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

function errorResponse(kind: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ error: { kind, message, ...extra } }, status);
}

function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  return match ? match[1] : null;
}

const INCOMPLETE_MESSAGES = {
  storage: 'Your account couldn’t be deleted yet — nothing has been removed from your profile. Please try again.',
  database: 'Your account couldn’t be deleted yet. Please try again.',
  auth: 'Your data was removed, but your account couldn’t be closed yet. Please try again to finish.',
} as const;

export function createDeleteAccountHandler(deps: DeleteAccountDeps): (req: Request) => Promise<Response> {
  const log = deps.log ?? (() => {});

  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders() });
    }
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', 'Method not allowed', 405);
    }

    const token = bearerToken(req);
    if (!token) {
      return errorResponse('unauthenticated', 'Sign in to delete your account.', 401);
    }
    const user = await deps.getUser(token);
    if ('error' in user) {
      if (user.error === 'user_not_found') return jsonResponse({ status: 'already_deleted' });
      return errorResponse('unauthenticated', 'Your session has expired. Sign in again to delete your account.', 401);
    }
    const accountId = user.userId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_request', 'Malformed request body', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('confirmation_required', `Type ${CONFIRMATION} to confirm.`, 400);
    }
    // The only accepted field is the confirmation. Anything else — above all
    // a user/account/profile id, email or admin flag — is refused rather
    // than ignored: the target is always the signed-in account.
    if (Object.keys(body).some((key) => key !== 'confirm')) {
      return errorResponse('target_not_allowed', 'This only deletes the signed-in account; no target can be given.', 400);
    }
    if ((body as { confirm?: unknown }).confirm !== CONFIRMATION) {
      return errorResponse('confirmation_required', `Type ${CONFIRMATION} to confirm.`, 400);
    }

    // 1. Storage.
    try {
      const objects = await deps.listStorageObjects(accountId);
      const byBucket = new Map<string, string[]>();
      for (const o of objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.name]);
      for (const [bucket, names] of byBucket) {
        for (let i = 0; i < names.length; i += REMOVE_BATCH) {
          await deps.removeStorageObjects(bucket, names.slice(i, i + REMOVE_BATCH));
        }
      }
    } catch (err) {
      log(`[delete-account] storage step failed for ${accountId}`, err);
      return errorResponse('deletion_incomplete', INCOMPLETE_MESSAGES.storage, 500, { step: 'storage' });
    }

    // 2. Database.
    try {
      await deps.deleteAccountData(accountId);
    } catch (err) {
      log(`[delete-account] database step failed for ${accountId}`, err);
      return errorResponse('deletion_incomplete', INCOMPLETE_MESSAGES.database, 500, { step: 'database' });
    }

    // 3. Auth — last, so every earlier step can be retried until here.
    try {
      await deps.deleteAuthUser(accountId);
    } catch (err) {
      log(`[delete-account] auth step failed for ${accountId} — data removed, Auth user still exists`, err);
      return errorResponse('deletion_incomplete', INCOMPLETE_MESSAGES.auth, 500, { step: 'auth' });
    }

    return jsonResponse({ status: 'deleted' });
  };
}
