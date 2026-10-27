-- Learn Tunisian: Request a Translation.
--
-- A signed-in learner asks for an English phrase/sentence in Tunisian
-- Arabic; an admin answers with the Arabic, a transliteration, the English
-- meaning and a native-speaker recording. "We will respond within 3
-- business days" (Mon–Fri, Tunis time — see translation_request_due_at).
--
-- Security model:
--   * Requests are owned by the *account* (auth.uid()), never by anything
--     the client sends, so switching profiles changes nothing.
--   * Clients have NO insert/update/delete policy on translation_requests.
--     Every write is a SECURITY DEFINER function below that re-checks the
--     caller, the free-request limit and the request's status. Learners
--     read only through my_translation_requests() (own rows, learner-safe
--     columns); admins may select the table directly.
--   * Free accounts get one request in total (every request counts except
--     ones an admin rejected); Premium accounts are unlimited. Entitlement is
--     profiles.is_premium on any of the account's profiles, or the account
--     being an admin — and is_premium can no longer be self-granted (below).
--   * Answer audio lives in a PRIVATE bucket (translation-audio). The public
--     "audio" bucket can be listed by anyone (0001_init.sql's read policy),
--     which would expose every learner's private answer.

-- ============================================================================
-- PREMIUM CAN'T BE SELF-GRANTED
--
-- profiles_all_own (0001_init.sql) lets an account owner write every column
-- of their own profiles — including is_premium, which every Premium gate
-- (and this feature's free limit) trusts. Same shape as
-- prevent_self_admin_promotion (0009): an app session that isn't an admin
-- can't change it. auth.uid() is null for the service role and the SQL
-- editor, which is how Premium is granted today (there's no purchase
-- provider in the app yet — see src/lib/premium/access.ts).
-- ============================================================================
create function public.prevent_self_premium_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.is_premium then
      raise exception 'Only an admin or the billing backend can grant Premium.' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.is_premium is distinct from old.is_premium then
      raise exception 'Only an admin or the billing backend can change Premium.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_is_premium
  before insert or update on public.profiles
  for each row execute function public.prevent_self_premium_grant();

-- ============================================================================
-- ENTITLEMENT (per account)
-- ============================================================================
create function public.account_has_translation_premium(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.accounts where id = p_account_id), false)
    or exists (select 1 from public.profiles where account_id = p_account_id and is_premium);
$$;

-- Internal helper for the functions below — not callable from the app.
revoke all on function public.account_has_translation_premium(uuid) from public, anon, authenticated;

-- ============================================================================
-- BUSINESS-DAY DEADLINE (mirrors src/lib/translationRequests/deadline.ts)
--
-- The end of the 3rd Monday–Friday day after the (Tunis) day the request
-- was sent: Mon → end of Thu; Fri/Sat/Sun → end of Wed. Holidays aren't
-- modelled.
-- ============================================================================
create function public.translation_request_due_at(p_submitted_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_day date := (p_submitted_at at time zone 'Africa/Tunis')::date;
  v_added int := 0;
begin
  while v_added < 3 loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 then
      v_added := v_added + 1;
    end if;
  end loop;
  return (v_day + 1)::timestamp at time zone 'Africa/Tunis';
end;
$$;

-- ============================================================================
-- TABLE
-- ============================================================================
create table public.translation_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Idempotency key from the app: a double tap or a retried request returns
  -- the existing row instead of creating a second one.
  client_request_id uuid not null,
  english_text text not null check (char_length(english_text) between 1 and 500),
  -- submitted/in_progress show to the learner as "submitted"; rejected and
  -- cancelled are kept for the admin record but never shown to the learner.
  status text not null default 'submitted' check (
    status in ('submitted', 'in_progress', 'answered', 'rejected', 'cancelled')
  ),
  submitted_at timestamptz not null default now(),
  due_at timestamptz not null,
  answer_arabic text check (char_length(answer_arabic) <= 500),
  answer_transliteration text check (char_length(answer_transliteration) <= 500),
  answer_english text check (char_length(answer_english) <= 500),
  -- Path inside the private translation-audio bucket: "<request id>/answer-<ms>.<ext>".
  answer_audio_path text check (char_length(answer_audio_path) <= 300),
  answered_at timestamptz,
  -- When the learner first saw the answer (clears the in-app "ready" notice).
  answer_seen_at timestamptz,
  cancelled_at timestamptz,
  rejected_at timestamptz,
  handled_by uuid references public.accounts (id) on delete set null,
  -- Set when an admin copied the answer into shared content (as pending_review).
  shared_word_group_id text references public.word_groups (id) on delete set null,
  -- Written by the translation-answered-email Edge Function (service role).
  email_status text check (email_status in ('sent', 'failed', 'not_configured')),
  email_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (account_id, client_request_id),
  constraint translation_requests_answer_complete check (
    status <> 'answered' or (
      answer_arabic is not null
      and answer_transliteration is not null
      and answer_english is not null
      and answer_audio_path is not null
      and answered_at is not null
    )
  )
);

create index translation_requests_account_idx on public.translation_requests (account_id, submitted_at desc);
create index translation_requests_open_idx on public.translation_requests (due_at)
  where status in ('submitted', 'in_progress');

create trigger translation_requests_set_updated_at
  before update on public.translation_requests
  for each row execute function public.set_updated_at();

alter table public.translation_requests enable row level security;

-- Admins read the queue directly. Nobody gets a write policy.
create policy "translation_requests_select_admin" on public.translation_requests
  for select using (public.is_admin());

-- ============================================================================
-- LEARNER FUNCTIONS
-- ============================================================================
create function public.submit_translation_request(p_english_text text, p_client_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(coalesce(p_english_text, ''));
  v_id uuid;
  v_used int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_text) = 0 or char_length(v_text) > 500 then
    raise exception 'invalid_request_text' using errcode = '22023';
  end if;
  if p_client_request_id is null then
    raise exception 'missing_client_request_id' using errcode = '22023';
  end if;

  -- One submit at a time per account, so two parallel requests can't both
  -- pass the free-limit check below.
  perform 1 from public.accounts where id = v_uid for update;

  select id into v_id from public.translation_requests
    where account_id = v_uid and client_request_id = p_client_request_id;
  if v_id is not null then
    return v_id;
  end if;

  if not public.account_has_translation_premium(v_uid) then
    select count(*) into v_used from public.translation_requests
      where account_id = v_uid and status <> 'rejected';
    if v_used >= 1 then
      raise exception 'free_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public.translation_requests (account_id, client_request_id, english_text, due_at)
    values (v_uid, p_client_request_id, v_text, public.translation_request_due_at(now()))
    returning id into v_id;
  return v_id;
end;
$$;

create function public.translation_request_allowance()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_premium boolean;
  v_used int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_premium := public.account_has_translation_premium(v_uid);
  select count(*) into v_used from public.translation_requests
    where account_id = v_uid and status <> 'rejected';
  return json_build_object(
    'is_premium', v_premium,
    'used', v_used,
    'remaining', case when v_premium then null else greatest(0, 1 - v_used) end
  );
end;
$$;

-- Learner-safe view of the caller's own requests: no admin metadata, and no
-- answer content until it has actually been sent.
create function public.my_translation_requests()
returns table (
  id uuid,
  english_text text,
  status text,
  submitted_at timestamptz,
  due_at timestamptz,
  answered_at timestamptz,
  answer_arabic text,
  answer_transliteration text,
  answer_english text,
  answer_audio_path text,
  is_new boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.english_text,
    case when r.status = 'answered' then 'answered' else 'submitted' end,
    r.submitted_at,
    r.due_at,
    r.answered_at,
    case when r.status = 'answered' then r.answer_arabic end,
    case when r.status = 'answered' then r.answer_transliteration end,
    case when r.status = 'answered' then r.answer_english end,
    case when r.status = 'answered' then r.answer_audio_path end,
    r.status = 'answered' and r.answer_seen_at is null
  from public.translation_requests r
  where r.account_id = auth.uid()
    and r.status in ('submitted', 'in_progress', 'answered')
  order by r.submitted_at desc;
$$;

create function public.cancel_translation_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.translation_requests
    set status = 'cancelled', cancelled_at = now()
    where id = p_request_id and account_id = auth.uid() and status in ('submitted', 'in_progress');
  if not found then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
end;
$$;

create function public.mark_translation_answers_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.translation_requests
    set answer_seen_at = now()
    where account_id = auth.uid() and status = 'answered' and answer_seen_at is null;
$$;

-- ============================================================================
-- ADMIN FUNCTIONS
-- ============================================================================
create function public.admin_mark_translation_request_in_progress(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can handle translation requests.' using errcode = '42501';
  end if;
  update public.translation_requests
    set status = 'in_progress', handled_by = auth.uid()
    where id = p_request_id and status in ('submitted', 'in_progress');
  if not found then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
end;
$$;

-- The row is kept (status 'rejected') for the admin record; the learner no
-- longer sees it, and it no longer counts toward their free request.
create function public.admin_reject_translation_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject translation requests.' using errcode = '42501';
  end if;
  update public.translation_requests
    set status = 'rejected', rejected_at = now(), handled_by = auth.uid()
    where id = p_request_id and status in ('submitted', 'in_progress');
  if not found then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
end;
$$;

-- Called by the admin recorder once a new recording is uploaded; returns the
-- path the row now holds (the recorder only deletes the previous file once
-- this matches the new one).
create function public.admin_set_translation_answer_audio(p_request_id uuid, p_audio_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can record translation answers.' using errcode = '42501';
  end if;
  if p_audio_path is null or not (p_audio_path like p_request_id::text || '/%') then
    raise exception 'invalid_audio_path' using errcode = '22023';
  end if;
  update public.translation_requests
    set answer_audio_path = p_audio_path, handled_by = auth.uid()
    where id = p_request_id and status in ('submitted', 'in_progress')
    returning answer_audio_path into v_path;
  if v_path is null then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  return v_path;
end;
$$;

-- Marks the request answered only together with a complete answer, and only
-- when the native recording is already saved on the row.
create function public.admin_answer_translation_request(
  p_request_id uuid,
  p_arabic text,
  p_transliteration text,
  p_english text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_audio text;
  v_arabic text := btrim(coalesce(p_arabic, ''));
  v_transliteration text := btrim(coalesce(p_transliteration, ''));
  v_english text := btrim(coalesce(p_english, ''));
begin
  if not public.is_admin() then
    raise exception 'Only admins can answer translation requests.' using errcode = '42501';
  end if;
  if char_length(v_arabic) not between 1 and 500
     or char_length(v_transliteration) not between 1 and 500
     or char_length(v_english) not between 1 and 500 then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;

  select status, answer_audio_path into v_status, v_audio
    from public.translation_requests where id = p_request_id
    for update;
  if v_status is null or v_status not in ('submitted', 'in_progress') then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if v_audio is null then
    raise exception 'answer_audio_missing' using errcode = 'P0001';
  end if;

  update public.translation_requests
    set answer_arabic = v_arabic,
        answer_transliteration = v_transliteration,
        answer_english = v_english,
        status = 'answered',
        answered_at = now(),
        handled_by = auth.uid()
    where id = p_request_id;
end;
$$;

create function public.admin_link_translation_shared_content(p_request_id uuid, p_word_group_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can share translations.' using errcode = '42501';
  end if;
  update public.translation_requests
    set shared_word_group_id = p_word_group_id
    where id = p_request_id and status = 'answered';
  if not found then
    raise exception 'not_answered' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.submit_translation_request(text, uuid) from public, anon;
grant execute on function public.submit_translation_request(text, uuid) to authenticated;
revoke all on function public.translation_request_allowance() from public, anon;
grant execute on function public.translation_request_allowance() to authenticated;
revoke all on function public.my_translation_requests() from public, anon;
grant execute on function public.my_translation_requests() to authenticated;
revoke all on function public.cancel_translation_request(uuid) from public, anon;
grant execute on function public.cancel_translation_request(uuid) to authenticated;
revoke all on function public.mark_translation_answers_seen() from public, anon;
grant execute on function public.mark_translation_answers_seen() to authenticated;
revoke all on function public.admin_mark_translation_request_in_progress(uuid) from public, anon;
grant execute on function public.admin_mark_translation_request_in_progress(uuid) to authenticated;
revoke all on function public.admin_reject_translation_request(uuid) from public, anon;
grant execute on function public.admin_reject_translation_request(uuid) to authenticated;
revoke all on function public.admin_set_translation_answer_audio(uuid, text) from public, anon;
grant execute on function public.admin_set_translation_answer_audio(uuid, text) to authenticated;
revoke all on function public.admin_answer_translation_request(uuid, text, text, text) from public, anon;
grant execute on function public.admin_answer_translation_request(uuid, text, text, text) to authenticated;
revoke all on function public.admin_link_translation_shared_content(uuid, text) from public, anon;
grant execute on function public.admin_link_translation_shared_content(uuid, text) to authenticated;

-- ============================================================================
-- PRIVATE ANSWER AUDIO
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
  values ('translation-audio', 'translation-audio', false, 15728640)
  on conflict (id) do nothing;

create policy "translation_audio_admin_insert" on storage.objects
  for insert with check (bucket_id = 'translation-audio' and public.is_admin());
create policy "translation_audio_admin_update" on storage.objects
  for update using (bucket_id = 'translation-audio' and public.is_admin())
  with check (bucket_id = 'translation-audio' and public.is_admin());
create policy "translation_audio_admin_delete" on storage.objects
  for delete using (bucket_id = 'translation-audio' and public.is_admin());
-- A learner can read (sign a URL for) only the audio of their own answered request.
create policy "translation_audio_read_own_answer" on storage.objects
  for select using (
    bucket_id = 'translation-audio'
    and (
      public.is_admin()
      or exists (
        select 1 from public.translation_requests r
        where r.account_id = auth.uid()
          and r.status = 'answered'
          and r.answer_audio_path = storage.objects.name
      )
    )
  );
