-- Learn Tunisian: in-app feedback (Profile → Send feedback).
--
-- Prerequisites: 0022 (accounts / account deletion). Apply after 0028.
--
-- - Signed-in learners can send short notes; guests can't (they're
--   device-only: no server writes). A learner can't read feedback back, edit
--   or delete it, or send it for another account.
-- - Admins read it all and mark notes as read.
-- - At most 20 notes per account per day (a spam guard).
-- - Account deletion: the notes go with the account (on delete cascade from
--   public.accounts, which delete_account_data deletes). No files.

create table public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  -- Where it was sent from (a route like "/learn"), and the app version — no device details.
  screen text check (screen is null or char_length(screen) <= 100),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index app_feedback_created_idx on public.app_feedback (created_at desc);
create index app_feedback_account_idx on public.app_feedback (account_id);

alter table public.app_feedback enable row level security;
revoke all on public.app_feedback from public, anon, authenticated;
grant insert (account_id, message, screen, app_version) on public.app_feedback to authenticated;
grant select on public.app_feedback to authenticated;
grant update (read_at) on public.app_feedback to authenticated;

create policy "app_feedback_send_own" on public.app_feedback
  for insert to authenticated with check (account_id = auth.uid());
create policy "app_feedback_admin_read" on public.app_feedback
  for select to authenticated using (public.is_admin());
create policy "app_feedback_admin_mark_read" on public.app_feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.limit_app_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.app_feedback
      where account_id = new.account_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'feedback_limit' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger app_feedback_daily_limit
  before insert on public.app_feedback
  for each row execute function public.limit_app_feedback();
