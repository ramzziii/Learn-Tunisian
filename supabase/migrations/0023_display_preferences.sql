-- Learn Tunisian: learner display preferences.
--
-- Two display-only settings per learner profile:
--   script — which writing to show for Tunisian words: Arabic script, Latin
--            transliteration, or both;
--   form   — for words and phrases that have masculine and feminine forms
--            (word_variants labelled 'masculine'/'feminine'), which form to
--            show first: masculine, feminine, or both.
--
-- This is deliberately NOT a profile column and NOT a gender field: the app
-- asks "which form would you like to practice by default?", never the
-- learner's gender, and uses the answer only to order what's on screen. It
-- isn't readable by admins, isn't sent to analytics or to the AI tutor, and
-- isn't used to infer anything.
--
-- Existing learners have no row; the app treats a missing row as
-- script = 'both', form = 'both'. Nobody is assigned a form they didn't
-- choose. The row goes with the profile (cascade), so account deletion
-- (delete_account_data, 0022) removes it too.

create table public.learner_display_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  script text not null default 'both' check (script in ('arabic', 'latin', 'both')),
  form text not null default 'both' check (form in ('masculine', 'feminine', 'both')),
  updated_at timestamptz not null default now()
);

create trigger learner_display_preferences_set_updated_at
  before update on public.learner_display_preferences
  for each row execute function public.set_updated_at();

alter table public.learner_display_preferences enable row level security;

-- The profile's own account only. No admin policy: nobody else needs it.
create policy "learner_display_preferences_select_own" on public.learner_display_preferences
  for select to authenticated using (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );
create policy "learner_display_preferences_insert_own" on public.learner_display_preferences
  for insert to authenticated with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );
create policy "learner_display_preferences_update_own" on public.learner_display_preferences
  for update to authenticated using (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  ) with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );

revoke all on public.learner_display_preferences from public, anon;
revoke delete, truncate on public.learner_display_preferences from authenticated;
