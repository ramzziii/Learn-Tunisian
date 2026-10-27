-- Learn Tunisian: AI spend quota + account email integrity (run-1 security audit).
--
-- 1. One server-owned daily AI quota per ACCOUNT, consumed atomically before
--    any paid AI call:
--    - talk-to-a-tunisian's old cap counted corrections rows for a
--      client-supplied profileId under the caller's RLS, so a foreign or
--      made-up profileId always counted 0, the counter row was best-effort,
--      and a count error was treated as allowed. It now calls
--      consume_ai_quota('chat') instead.
--    - talk-tts and talk-stt had no caller check and no quota at all, and the
--      client falls back to the public anon key when signed out. They now
--      call consume_ai_quota('tts' / 'stt'), which also refuses any caller
--      without a user identity.
--    The limits below are per account per UTC day; an account can hold
--    several profiles, so they are set above the old 20-turns-per-profile.
--
-- 2. accounts.email was writable by its owner (accounts_update_own has no
--    column restriction), yet the documented admin bootstrap
--    (`... where email = '...'`, 0009) and translation-answered-email both
--    treated it as the account's verified address. The app never updates
--    accounts, so client UPDATE is revoked; the column is kept in sync with
--    auth.users (the verified login email) by a trigger, and any value that
--    already drifted is repaired here.

-- ============================================================================
-- 1. AI quota
-- ============================================================================
create table public.ai_daily_usage (
  account_id uuid not null references public.accounts (id) on delete cascade,
  usage_date date not null,
  kind text not null check (kind in ('chat', 'tts', 'stt')),
  count int not null default 0 check (count >= 0),
  primary key (account_id, usage_date, kind)
);

alter table public.ai_daily_usage enable row level security;

-- Readable by the owner (and admins, for support); only consume_ai_quota writes.
create policy "ai_daily_usage_select_own_or_admin" on public.ai_daily_usage
  for select using (account_id = auth.uid() or public.is_admin());

-- Returns true and counts the call when the caller is under today's limit;
-- returns false (and counts nothing) when the limit is reached. Raises for a
-- caller with no user identity, so the anon key alone can never spend.
create function public.consume_ai_quota(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_limit int;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_limit := case p_kind
    when 'chat' then 60
    when 'tts' then 200
    when 'stt' then 150
  end;
  if v_limit is null then
    raise exception 'invalid_quota_kind' using errcode = '22023';
  end if;

  insert into public.ai_daily_usage (account_id, usage_date, kind, count)
    values (v_uid, v_day, p_kind, 1)
  on conflict (account_id, usage_date, kind) do update
    set count = public.ai_daily_usage.count + 1
    where public.ai_daily_usage.count < v_limit
  returning count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- ============================================================================
-- 2. accounts.email: verified, not learner-editable
-- ============================================================================
revoke update on public.accounts from authenticated, anon;

create function public.sync_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.accounts set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_account_email();

-- Repair any accounts.email that was already changed away from the login email.
update public.accounts a
  set email = u.email
  from auth.users u
  where u.id = a.id and a.email is distinct from u.email;

-- Admin bootstrap from now on: accounts.email always mirrors the verified
-- login email, but selecting by id is still the unambiguous form:
--   update public.accounts set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
