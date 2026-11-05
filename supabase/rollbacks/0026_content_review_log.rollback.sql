-- Rollback for 0026_content_review_log.sql: restores 0022's delete_account_data,
-- then removes only what 0026 created. Dropping content_review_events deletes
-- the native review history; export it first if any reviews have been imported.
create or replace function public.delete_account_data(p_account_id uuid)
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

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

drop table if exists public.content_source_notes;
drop table if exists public.content_review_events;
