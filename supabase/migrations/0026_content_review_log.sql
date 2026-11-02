-- Learn Tunisian: private record of native text reviews and import notes
-- (content pipeline: docs/content-pipeline.md).
--
-- content_review_events: one row per verdict from scripts/import-review.mjs.
-- It keeps history if the word is later deleted (on delete set null, plus a
-- snapshot of the id, label and text that was reviewed), so deleting a form,
-- its group or its unit — or re-running seed.sql — can't erase the record
-- that a native speaker approved a text.
--
-- content_source_notes: the workbook's internal note per form (confidence tag
-- and reviewer hints). Deleted with its form on purpose: it only describes
-- that row. Kept off word_variants.notes, which learners see in the
-- Phrasebook.
--
-- Only the service-role content scripts write; admins can read; learners
-- can't see either table (word_variants itself is readable by every signed-in
-- user, which is why reviewer names don't go there).

create table public.content_review_events (
  id uuid primary key default gen_random_uuid(),
  word_variant_id uuid references public.word_variants (id) on delete set null,
  word_group_id text not null,
  variant_label text not null,
  verdict text not null check (verdict in ('ok', 'fix', 'reject')),
  reviewer_account_id uuid references public.accounts (id) on delete set null,
  reviewer_name text check (reviewer_name is null or char_length(reviewer_name) between 1 and 100),
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 1000),
  reviewed_arabic text not null,
  reviewed_transliteration text not null,
  corrected_arabic text,
  corrected_transliteration text,
  reviewed_at timestamptz not null default now()
);
create index content_review_events_variant_idx on public.content_review_events (word_variant_id);
create index content_review_events_group_idx on public.content_review_events (word_group_id);

create table public.content_source_notes (
  word_variant_id uuid primary key references public.word_variants (id) on delete cascade,
  note text not null check (char_length(note) <= 1000),
  updated_at timestamptz not null default now()
);

alter table public.content_review_events enable row level security;
alter table public.content_source_notes enable row level security;
revoke all on public.content_review_events from public, anon, authenticated;
revoke all on public.content_source_notes from public, anon, authenticated;
grant select on public.content_review_events to authenticated;
grant select on public.content_source_notes to authenticated;
create policy "content_review_events_admin_read" on public.content_review_events
  for select to authenticated using (public.is_admin());
create policy "content_source_notes_admin_read" on public.content_source_notes
  for select to authenticated using (public.is_admin());

-- Account deletion: a deleted reviewer's name and account link are removed
-- from the review history; the verdicts and reviewed texts stay. Identical to
-- 0022's function plus the content_review_events statement.
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
  update public.content_review_events
    set reviewer_account_id = null, reviewer_name = null
    where reviewer_account_id = p_account_id;

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
