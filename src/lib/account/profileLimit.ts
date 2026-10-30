/**
 * One learner profile per account (= one Supabase Auth user = one login
 * email). The database is the authority — 0019_one_profile_per_account.sql
 * rejects a second profile for every caller with
 * `profile_already_exists` / SQLSTATE 23505 — and the app checks first so
 * the normal flows never even try.
 */
export class ProfileAlreadyExistsError extends Error {
  constructor() {
    super('This account already has a learner profile.');
    this.name = 'ProfileAlreadyExistsError';
  }
}

/** True for the database's one-profile-per-account rejection. */
export function isProfileAlreadyExistsDbError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === '23505' && typeof message === 'string' && message.includes('profile_already_exists');
}
