-- Learn Tunisian: Admin Phase 2 — review rules, audio re-check, import log.
--
-- Prerequisites: 0024 (guest preview views), 0026 (content_review_events),
-- 0027 (applied before this one). Before applying, add your own account to
-- public.reviewers by hand in the SQL editor — otherwise nobody can approve
-- content afterwards. (No account ids or emails in the repo.)
--
-- 1. Only language reviewers (public.reviewers) can approve (make live) or
--    reject content, or mark a form's text as checked by a native speaker.
--    Being an admin is not enough. Admins can still edit, send back to draft
--    or archive. The content scripts use the service role, which this
--    trigger doesn't check — scripts/import-review.mjs checks
--    public.reviewers itself before reading or writing anything.
-- 2. Audio re-check: when a form's spelling changes and it has a recording,
--    the file is kept and flagged "needs re-check" (audio_needs_recheck).
--    It's separate from text approval (native_verified) and from the native
--    voice flag (is_native_voice). While flagged, learners never hear it and
--    exercises never use it. The flag is cleared only by replacing the file
--    or by confirm_audio_matches (an admin or reviewer, after listening) —
--    never by editing the field directly. confirm_audio_matches leaves a
--    one-time token in audio_recheck_confirmations, a table no client role
--    (anon, authenticated, service_role) can read or write; the guard
--    accepts a clear only with that token. (A Postgres superuser can still
--    do anything, e.g. disable triggers — no table rule can stop that.)
-- 3. review_word_variant: the in-app Review tab's ok / fix / reject, with the
--    same rules as scripts/import-review.mjs, logged in content_review_events.
--    One call, one transaction.
-- 4. content_import_runs: a log of imports run with --execute
--    (scripts/import-content.mjs) and their problems. Dry runs are never
--    logged — they write nothing at all.

-- 1. Reviewer-only approval and rejection ------------------------------------

create function public.enforce_reviewer_approval()
returns trigger
language plpgsql
as $$
begin
  -- Only API callers are checked: the app (authenticated) and visitors (anon).
  -- The content scripts use the service role and check public.reviewers
  -- themselves; migrations and the SQL editor run as the database owner.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.content_status in ('approved', 'rejected')
     and (tg_op = 'INSERT' or old.content_status is distinct from new.content_status)
     and not public.is_reviewer() then
    raise exception 'permission denied: only language reviewers can approve or reject content' using errcode = '42501';
  end if;

  if tg_table_name = 'word_variants' then
    if new.native_verified and (tg_op = 'INSERT' or not old.native_verified) and not public.is_reviewer() then
      raise exception 'permission denied: only language reviewers can mark text as checked' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger word_groups_reviewer_approval
  before insert or update of content_status on public.word_groups
  for each row execute function public.enforce_reviewer_approval();

create trigger word_variants_reviewer_approval
  before insert or update of content_status, native_verified on public.word_variants
  for each row execute function public.enforce_reviewer_approval();

-- 2. Audio re-check ------------------------------------------------------------

alter table public.word_variants
  add column audio_needs_recheck boolean not null default false;

-- One-time confirmation tokens: (form, transaction). Written and consumed
-- only by the security-definer functions below; no client role has any
-- privilege on it (revoked explicitly, since Supabase grants new public
-- tables to anon / authenticated / service_role by default).
create table public.audio_recheck_confirmations (
  variant_id uuid not null,
  txid bigint not null,
  primary key (variant_id, txid)
);
alter table public.audio_recheck_confirmations enable row level security;
revoke all on public.audio_recheck_confirmations from public, anon, authenticated, service_role;

create function public.guard_audio_recheck()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audio_path is distinct from old.audio_path then
    -- A new (or removed) recording replaces the old one: nothing left to re-check.
    new.audio_needs_recheck := false;
  elsif (new.word_arabic is distinct from old.word_arabic or new.transliteration is distinct from old.transliteration)
        and new.audio_path is not null then
    -- The spelling changed under an existing recording: keep it, flag it.
    new.audio_needs_recheck := true;
  elsif old.audio_needs_recheck and not new.audio_needs_recheck then
    -- Only confirm_audio_matches (or a new file) may clear the flag: it must
    -- have left a token for this form in this transaction. Used up here.
    delete from public.audio_recheck_confirmations
      where variant_id = new.id and txid = txid_current();
    if not found then
      raise exception 'permission denied: a recording that needs re-check is cleared only by confirming it or replacing it' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger word_variants_guard_audio_recheck
  before update of word_arabic, transliteration, audio_path, audio_needs_recheck on public.word_variants
  for each row execute function public.guard_audio_recheck();

/** "Still matches": an admin or reviewer listened and confirms. Never touches text approval or native voice. */
create function public.confirm_audio_matches(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed int;
begin
  if not (public.is_admin() or public.is_reviewer()) then
    raise exception 'permission denied: only admins or language reviewers can confirm a recording' using errcode = '42501';
  end if;
  -- One-time token for this form in this transaction; the guard uses it up.
  insert into public.audio_recheck_confirmations (variant_id, txid)
    values (p_variant_id, txid_current()) on conflict do nothing;
  update public.word_variants
    set audio_needs_recheck = false
    where id = p_variant_id and audio_path is not null and audio_needs_recheck;
  get diagnostics v_confirmed = row_count;
  -- Nothing matched: the token is still there, so remove it.
  delete from public.audio_recheck_confirmations
    where variant_id = p_variant_id and txid = txid_current();
  if v_confirmed = 0 then
    raise exception 'nothing_to_confirm' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.confirm_audio_matches(uuid) from public, anon, authenticated;
grant execute on function public.confirm_audio_matches(uuid) to authenticated;

-- Guests need the flag too: 0024's view lists its columns, so it's replaced
-- with the same definition plus audio_needs_recheck (added at the end).
create or replace view public.guest_preview_word_variants with (security_barrier) as
  select v.id, v.word_group_id, v.variant_label, v.word_arabic, v.transliteration, v.audio_path,
         v.notes, v.sort_order, v.native_verified, v.is_native_voice, v.content_status,
         v.in_repeat_after_me, v.updated_at, v.audio_needs_recheck
  from public.word_variants v join public.guest_preview_word_groups g on g.id = v.word_group_id
  where v.content_status = 'approved';

revoke all on public.guest_preview_word_variants from public, anon, authenticated;
grant select on public.guest_preview_word_variants to anon, authenticated;

-- 3. In-app review -------------------------------------------------------------

/**
 * Reviews one form: 'ok' (approve, text checked), 'fix' (apply the correction,
 * then approve) or 'reject'. Reviewers only. A corrected spelling flags an
 * existing recording for re-check (trigger above). The word group becomes
 * live once all its remaining forms are approved and still make a valid set
 * (one primary, or a masculine + feminine pair), and rejected when every form
 * is rejected. Returns the word group's status afterwards.
 */
create function public.review_word_variant(
  p_variant_id uuid,
  p_verdict text,
  p_corrected_arabic text default null,
  p_corrected_transliteration text default null,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.word_variants%rowtype;
  v_reviewer uuid := auth.uid();
  v_name text;
  v_arabic text;
  v_latin text;
  v_fix_arabic text := nullif(btrim(p_corrected_arabic), '');
  v_fix_latin text := nullif(btrim(p_corrected_transliteration), '');
  v_note text := nullif(btrim(p_note), '');
  v_active int;
  v_approved int;
  v_primary int;
  v_masculine int;
  v_feminine int;
  v_also int;
  v_group_status text;
begin
  if v_reviewer is null or not public.is_reviewer() then
    raise exception 'permission denied: only language reviewers can review content' using errcode = '42501';
  end if;
  if p_verdict is null or p_verdict not in ('ok', 'fix', 'reject') then
    raise exception 'invalid_verdict' using errcode = '22023';
  end if;

  select * into v from public.word_variants where id = p_variant_id for update;
  if not found then
    raise exception 'unknown_variant' using errcode = '22023';
  end if;
  if v.content_status not in ('draft', 'pending_review') then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;
  if p_verdict = 'ok' and (v_fix_arabic is not null or v_fix_latin is not null) then
    raise exception 'ok_with_correction' using errcode = '22023';
  end if;
  if p_verdict = 'fix' then
    if v_fix_arabic is null and v_fix_latin is null then
      raise exception 'fix_needs_correction' using errcode = '22023';
    end if;
    if v_fix_latin is not null and v_fix_latin !~ '^[a-z0-9]+( [a-z0-9]+)*$' then
      raise exception 'bad_transliteration' using errcode = '22023';
    end if;
    if v_fix_arabic is not null and v_fix_arabic ~ '[A-Za-z0-9]' then
      raise exception 'latin_in_arabic' using errcode = '22023';
    end if;
  end if;

  v_arabic := coalesce(v_fix_arabic, v.word_arabic);
  v_latin := coalesce(v_fix_latin, v.transliteration);
  if p_verdict = 'fix' and v_arabic = v.word_arabic and v_latin = v.transliteration then
    raise exception 'fix_without_change' using errcode = '22023';
  end if;

  select p.name into v_name from public.profiles p where p.account_id = v_reviewer order by p.created_at limit 1;

  if p_verdict = 'reject' then
    update public.word_variants
      set content_status = 'rejected', native_verified = false, approved_by = null, approved_at = null
      where id = v.id;
  else
    update public.word_variants
      set content_status = 'approved', native_verified = true, approved_by = v_reviewer, approved_at = now(),
          word_arabic = v_arabic, transliteration = v_latin
      where id = v.id;
  end if;

  insert into public.content_review_events (
    word_variant_id, word_group_id, variant_label, verdict, reviewer_account_id, reviewer_name, reviewer_note,
    reviewed_arabic, reviewed_transliteration, corrected_arabic, corrected_transliteration
  ) values (
    v.id, v.word_group_id, v.variant_label, p_verdict, v_reviewer, v_name, v_note,
    v.word_arabic, v.transliteration,
    case when p_verdict = 'fix' then v_fix_arabic end,
    case when p_verdict = 'fix' then v_fix_latin end
  );

  select
    count(*) filter (where content_status not in ('rejected', 'archived')),
    count(*) filter (where content_status = 'approved'),
    count(*) filter (where content_status = 'approved' and variant_label = 'primary'),
    count(*) filter (where content_status = 'approved' and variant_label = 'masculine'),
    count(*) filter (where content_status = 'approved' and variant_label = 'feminine'),
    count(*) filter (where content_status = 'approved' and variant_label = 'also_heard')
  into v_active, v_approved, v_primary, v_masculine, v_feminine, v_also
  from public.word_variants
  where word_group_id = v.word_group_id;

  if v_active = 0 then
    update public.word_groups set content_status = 'rejected' where id = v.word_group_id and content_status <> 'rejected';
  elsif v_active = v_approved
        and ((v_primary = 1 and v_masculine = 0 and v_feminine = 0)
             or (v_primary = 0 and v_masculine = 1 and v_feminine = 1 and v_also = 0)) then
    update public.word_groups set content_status = 'approved' where id = v.word_group_id and content_status <> 'approved';
  end if;

  select content_status into v_group_status from public.word_groups where id = v.word_group_id;
  return v_group_status;
end;
$$;

revoke all on function public.review_word_variant(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.review_word_variant(uuid, text, text, text, text) to authenticated;

-- 4. Import log ------------------------------------------------------------------

create table public.content_import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  -- The sheet's file name only (no folder path).
  source_file text not null check (char_length(source_file) between 1 and 200),
  outcome text not null check (outcome in ('imported', 'refused', 'failed')),
  rows_read int not null default 0 check (rows_read >= 0),
  -- Counts: new units, lessons, words, forms; changed; unchanged.
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  -- [{ "rows": [12, 13], "message": "…" }] — row numbers and messages only.
  problems jsonb not null default '[]'::jsonb
    check (jsonb_typeof(problems) = 'array' and jsonb_array_length(problems) <= 500),
  -- Set by an admin to clear it from "Needs you now".
  acknowledged_at timestamptz
);
create index content_import_runs_started_idx on public.content_import_runs (started_at desc);

alter table public.content_import_runs enable row level security;
revoke all on public.content_import_runs from public, anon, authenticated;
grant select on public.content_import_runs to authenticated;
grant update (acknowledged_at) on public.content_import_runs to authenticated;
create policy "content_import_runs_admin_read" on public.content_import_runs
  for select to authenticated using (public.is_admin());
create policy "content_import_runs_admin_acknowledge" on public.content_import_runs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No insert or delete for clients: the import script writes with the service role.
