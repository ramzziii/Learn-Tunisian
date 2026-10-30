-- Learn Tunisian: in-app account deletion — the database step.
--
-- Called only by the delete-account Edge Function (service role), for the
-- account id taken from the caller's verified JWT. The full sequence is
-- (see supabase/functions/delete-account/ and docs/account-deletion.md):
--   1. remove the account's private storage files (Storage API), using
--      account_storage_objects() below to find them;
--   2. delete_account_data() — this function;
--   3. delete the Auth user (Admin API).
-- These are separate services, so the sequence is NOT atomic; each step is
-- safe to repeat, and the Auth user — the thing that lets someone sign in
-- and retry — is removed last.
--
-- What happens to each table (decided from the actual foreign keys):
--
-- DELETED with the account (cascades from accounts / profiles):
--   profiles, daily_goal_settings, consent_records, progress, favorites,
--   session_logs, corrections (the learner's own AI conversation turns),
--   translation_requests (the learner's questions and the answers to them),
--   ai_daily_usage; plus reviewers (keyed on auth.users, deleted here).
--
-- KEPT, with this account's links removed (shared or other people's data):
--   units / lessons / word_groups / word_variants: created_by, updated_by,
--     approved_by, recording_skipped_by → null. The content stays — other
--     learners use it — including shared copies of this learner's
--     translation answers.
--   translation_requests of OTHER learners this account handled as an
--     admin: handled_by → null.
--   ai_usage_log: account_id, profile_id → null. Model, units, estimated
--     cost and budget month stay, so the monthly AI spend total stays
--     accurate (0021). Nothing in a row identifies the person.
--   ai_budget_reservations: account_id → null, same reason (a still-held
--     reservation keeps counting against the budget).
--
-- NOT changed: free-text name labels typed into shared content
-- (phrases / sentences / conversation_examples.native_reviewer,
-- corrections.reviewer_name, word_variants.speaker_name). They aren't
-- linked to an account, so this can't tell whose they are — see
-- docs/account-deletion.md for clearing one by hand on request.
--
-- Most of the above would also happen through the foreign keys' own
-- ON DELETE CASCADE / SET NULL; doing the anonymization explicitly makes
-- the decisions visible here and keeps them if a constraint ever changes.

-- ============================================================================
-- The account's private files, for the Edge Function to remove via the
-- Storage API (deleting storage.objects rows in SQL would orphan the files).
-- Only the private translation-audio bucket holds per-account files: each
-- request's answer and explanation recordings live under "<request id>/".
-- The public audio/images buckets hold shared content only (a shared copy of
-- a translation answer is a separate file there, and is kept).
-- ============================================================================
create function public.account_storage_objects(p_account_id uuid)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where o.bucket_id = 'translation-audio'
    and split_part(o.name, '/', 1) in (
      select r.id::text from public.translation_requests r where r.account_id = p_account_id
    )
  union
  select 'translation-audio', path
  from public.translation_requests r,
       lateral (values (r.answer_audio_path), (r.answer_explanation_audio_path)) as p (path)
  where r.account_id = p_account_id and path is not null;
$$;

-- ============================================================================
-- delete_account_data
-- ============================================================================
create function public.delete_account_data(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existed boolean;
  v_profile_ids uuid[];
begin
  if p_account_id is null then
    raise exception 'missing_account_id' using errcode = '22023';
  end if;

  select exists (select 1 from public.accounts where id = p_account_id) into v_existed;
  select coalesce(array_agg(id), '{}') into v_profile_ids from public.profiles where account_id = p_account_id;

  -- Retained records: remove this account's links.
  update public.ai_usage_log
    set account_id = null, profile_id = null
    where account_id = p_account_id or profile_id = any (v_profile_ids);
  update public.ai_budget_reservations set account_id = null where account_id = p_account_id;

  update public.units set created_by = null where created_by = p_account_id;
  update public.units set updated_by = null where updated_by = p_account_id;
  update public.lessons set created_by = null where created_by = p_account_id;
  update public.lessons set updated_by = null where updated_by = p_account_id;
  update public.word_groups set created_by = null where created_by = p_account_id;
  update public.word_groups set updated_by = null where updated_by = p_account_id;
  update public.word_variants set created_by = null where created_by = p_account_id;
  update public.word_variants set updated_by = null where updated_by = p_account_id;
  update public.word_variants set approved_by = null where approved_by = p_account_id;
  update public.word_variants set recording_skipped_by = null where recording_skipped_by = p_account_id;

  update public.translation_requests
    set handled_by = null
    where handled_by = p_account_id and account_id <> p_account_id;

  -- Deleted: the reviewer allowlist entry (keyed on auth.users, so it
  -- wouldn't go with the account row), then the account, which cascades to
  -- the profile and everything under it, consent, translation requests and
  -- daily AI counters.
  delete from public.reviewers where user_id = p_account_id;
  delete from public.accounts where id = p_account_id;

  return jsonb_build_object('account_deleted', v_existed, 'profiles_deleted', coalesce(array_length(v_profile_ids, 1), 0));
end;
$$;

revoke all on function public.account_storage_objects(uuid) from public, anon, authenticated;
revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_objects(uuid) to service_role;
grant execute on function public.delete_account_data(uuid) to service_role;
