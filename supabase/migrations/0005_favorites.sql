-- Learn Tunisian: favorites.
-- One row per (profile, word_group) a learner has starred. References the
-- existing word_groups rather than duplicating any content.

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  word_group_id text not null references public.word_groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, word_group_id)
);

create index favorites_profile_id_idx on public.favorites (profile_id);

alter table public.favorites enable row level security;

create policy "favorites_all_own" on public.favorites
  for all using (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  ) with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );
