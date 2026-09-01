-- Learn Tunisian: session logs.
--
-- Nothing in the existing schema tracks how many minutes a profile has
-- actually learned today (progress.last_seen_at tells you a word_group was
-- touched, not how long the session was) — needed for the Home screen's
-- "today's goal X / Y minutes" display, which can span multiple sessions
-- in a day. One row per completed session (lesson or review), logged when
-- the learner taps "Close" on the completion card.

create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  session_type text not null check (session_type in ('lesson', 'review')),
  duration_seconds int not null check (duration_seconds >= 0),
  completed_at timestamptz not null default now()
);

create index session_logs_profile_completed_idx on public.session_logs (profile_id, completed_at);

alter table public.session_logs enable row level security;

create policy "session_logs_all_own" on public.session_logs
  for all using (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  ) with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );
