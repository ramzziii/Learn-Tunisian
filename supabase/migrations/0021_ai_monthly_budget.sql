-- Learn Tunisian: project-wide monthly AI budget + complete cost logging.
--
-- Builds on 0018 (per-account daily quotas — unchanged here). Every paid
-- AI-provider call (chat, embedding, tts, stt) now goes through:
--
--   1. reserve_ai_budget  — before the call, atomically reserve a
--      conservative upper-bound cost against the month's budget. Counts
--      logged spend for the month AND every reservation still outstanding
--      ('reserved' or 'ambiguous'), under a per-month advisory lock, so
--      concurrent requests can't each read "there's room" and together
--      overshoot. Returns null (and reserves nothing) if the call would
--      exceed the budget.
--   2. the provider call (Edge Function).
--   3. one of:
--      reconcile_ai_budget      — the call was billed: write the final
--                                 ai_usage_log row (account, model, units,
--                                 estimated cost, pricing used) and close the
--                                 reservation, in one transaction;
--      release_ai_budget        — the provider definitely didn't bill (it
--                                 answered with an error status): free it;
--      mark_ai_budget_ambiguous — timeout / network failure: we can't tell,
--                                 so it stays counted until someone
--                                 reconciles or releases it by hand.
--
-- The budget amount itself comes from the Edge Functions' environment
-- (AI_MONTHLY_BUDGET_USD, default 10) and is passed in by them; these
-- functions are callable by the service role only (the Edge Functions and
-- the seed script), never by app clients — otherwise a client could pass
-- its own budget. Usage rows and reservations are not writable by clients
-- either. Months are UTC calendar months (ai_budget_month).
--
-- This is an app-side ESTIMATE, not the provider's billing cap — see
-- docs/cost-controls.md.

-- ============================================================================
-- UTC calendar month a timestamp's spend belongs to
-- ============================================================================
create function public.ai_budget_month(p_at timestamptz)
returns date
language sql
stable
as $$
  select date_trunc('month', p_at at time zone 'utc')::date;
$$;

-- ============================================================================
-- Reservations
-- ============================================================================
create table public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  -- The authenticated account that triggered the call (null for operator
  -- scripts). Kept on account deletion as null: the spend still happened.
  account_id uuid references public.accounts (id) on delete set null,
  call_type text not null check (call_type in ('chat', 'embedding', 'tts', 'stt')),
  model text not null,
  reserved_usd numeric(14, 8) not null check (reserved_usd >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'reconciled', 'released', 'ambiguous')),
  budget_month date not null,
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index ai_budget_reservations_outstanding_idx
  on public.ai_budget_reservations (budget_month)
  where status in ('reserved', 'ambiguous');

alter table public.ai_budget_reservations enable row level security;
-- No policies: only the service role (which bypasses RLS) and the SQL editor.
revoke all on public.ai_budget_reservations from public, anon, authenticated;

-- ============================================================================
-- ai_usage_log: every paid call, with its account and estimated cost
-- ============================================================================
alter table public.ai_usage_log
  add column account_id uuid references public.accounts (id) on delete set null,
  add column input_characters int check (input_characters >= 0),
  add column audio_seconds numeric(10, 3) check (audio_seconds >= 0),
  add column estimated_cost_usd numeric(14, 8) check (estimated_cost_usd >= 0),
  -- True when the provider didn't report usage and the reserved upper
  -- bound was recorded instead.
  add column usage_estimated boolean not null default false,
  -- Unit prices and units the estimate was computed from.
  add column pricing jsonb,
  add column reservation_id uuid unique references public.ai_budget_reservations (id) on delete set null,
  add column budget_month date;

alter table public.ai_usage_log drop constraint ai_usage_log_call_type_check;
alter table public.ai_usage_log
  add constraint ai_usage_log_call_type_check check (call_type in ('chat', 'embedding', 'tts', 'stt'));

create index ai_usage_log_budget_month_idx
  on public.ai_usage_log (budget_month)
  where estimated_cost_usd is not null;

-- Clients could insert usage rows for their own profiles (0017); usage is
-- now written only by reconcile_ai_budget.
drop policy "ai_usage_log_insert_own_profile" on public.ai_usage_log;
revoke insert, update, delete, truncate on public.ai_usage_log from anon, authenticated;

drop policy "ai_usage_log_select_own_or_admin" on public.ai_usage_log;
create policy "ai_usage_log_select_own_or_admin" on public.ai_usage_log
  for select using (
    public.is_admin()
    or account_id = auth.uid()
    or profile_id in (select id from public.profiles where account_id = auth.uid())
  );

-- ============================================================================
-- reserve_ai_budget
-- ============================================================================
create function public.reserve_ai_budget(
  p_account_id uuid,
  p_call_type text,
  p_model text,
  p_amount_usd numeric,
  p_budget_usd numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := public.ai_budget_month(now());
  v_spent numeric;
  v_held numeric;
  v_id uuid;
begin
  if p_amount_usd is null or p_amount_usd < 0 or p_budget_usd is null or p_budget_usd < 0 then
    raise exception 'invalid_budget_amount' using errcode = '22023';
  end if;
  if p_call_type is null or p_call_type not in ('chat', 'embedding', 'tts', 'stt') then
    raise exception 'invalid_call_type' using errcode = '22023';
  end if;

  -- One reservation at a time per month: the next caller waits here, then
  -- sees this one's row when it sums below.
  perform pg_advisory_xact_lock(hashtext('learn-tunisian:ai-monthly-budget:' || v_month::text));

  select coalesce(sum(estimated_cost_usd), 0) into v_spent
    from public.ai_usage_log
    where budget_month = v_month;

  select coalesce(sum(reserved_usd), 0) into v_held
    from public.ai_budget_reservations
    where budget_month = v_month and status in ('reserved', 'ambiguous');

  if v_spent + v_held + p_amount_usd > p_budget_usd then
    return null;
  end if;

  insert into public.ai_budget_reservations (account_id, call_type, model, reserved_usd, budget_month)
    values (p_account_id, p_call_type, p_model, p_amount_usd, v_month)
    returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- reconcile_ai_budget — the call was billed
-- ============================================================================
create function public.reconcile_ai_budget(
  p_reservation_id uuid,
  p_profile_id uuid,
  p_prompt_tokens int,
  p_completion_tokens int,
  p_total_tokens int,
  p_input_characters int,
  p_audio_seconds numeric,
  p_cost_usd numeric,
  p_usage_estimated boolean,
  p_pricing jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.ai_budget_reservations%rowtype;
  v_log_id uuid;
begin
  select * into v_res from public.ai_budget_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  if v_res.status not in ('reserved', 'ambiguous') then
    raise exception 'reservation_already_settled' using errcode = '55000';
  end if;
  if p_cost_usd is null or p_cost_usd < 0 then
    raise exception 'invalid_budget_amount' using errcode = '22023';
  end if;

  insert into public.ai_usage_log (
    profile_id, account_id, call_type, model,
    prompt_tokens, completion_tokens, total_tokens, input_characters, audio_seconds,
    estimated_cost_usd, usage_estimated, pricing, reservation_id, budget_month
  ) values (
    p_profile_id, v_res.account_id, v_res.call_type, v_res.model,
    p_prompt_tokens, p_completion_tokens, p_total_tokens, p_input_characters, p_audio_seconds,
    p_cost_usd, coalesce(p_usage_estimated, false), p_pricing, v_res.id, v_res.budget_month
  )
  returning id into v_log_id;

  update public.ai_budget_reservations
    set status = 'reconciled', settled_at = now()
    where id = v_res.id;

  return v_log_id;
end;
$$;

-- ============================================================================
-- release_ai_budget — no billable call happened
-- ============================================================================
create function public.release_ai_budget(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_budget_reservations
    set status = 'released', settled_at = now()
    where id = p_reservation_id and status = 'reserved';
  if not found then
    raise exception 'reservation_not_releasable' using errcode = '55000';
  end if;
end;
$$;

-- ============================================================================
-- mark_ai_budget_ambiguous — can't tell whether it was billed
-- ============================================================================
create function public.mark_ai_budget_ambiguous(p_reservation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_budget_reservations
    set status = 'ambiguous', note = left(p_reason, 500)
    where id = p_reservation_id and status = 'reserved';
  if not found then
    raise exception 'reservation_not_reserved' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.reserve_ai_budget(uuid, text, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.reconcile_ai_budget(uuid, uuid, int, int, int, int, numeric, numeric, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.release_ai_budget(uuid) from public, anon, authenticated;
revoke all on function public.mark_ai_budget_ambiguous(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_budget(uuid, text, text, numeric, numeric) to service_role;
grant execute on function public.reconcile_ai_budget(uuid, uuid, int, int, int, int, numeric, numeric, boolean, jsonb) to service_role;
grant execute on function public.release_ai_budget(uuid) to service_role;
grant execute on function public.mark_ai_budget_ambiguous(uuid, text) to service_role;
