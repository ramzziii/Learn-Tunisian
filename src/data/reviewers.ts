import { supabase } from '@/lib/supabase/client';

/**
 * Whether the signed-in user is an allowlisted language reviewer
 * (public.reviewers, 0020_language_reviewers.sql) — separate from admin
 * status. is_reviewer() takes no arguments, so it can only answer for the
 * caller. Throws if the lookup fails; callers must treat that as "no access
 * yet", never as yes. talk-review re-checks on the server either way.
 */
export async function fetchIsReviewer(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_reviewer');
  if (error) throw error;
  return data === true;
}
