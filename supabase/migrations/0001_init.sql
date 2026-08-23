-- Learn Tunisian: initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.

-- ============================================================================
-- ACCOUNTS
-- One row per Supabase auth user. An account can hold multiple profiles
-- (the adult's own profile, plus one profile per child).
-- ============================================================================
create table public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- Auto-create an account row whenever someone signs up via Supabase Auth,
-- regardless of which auth provider they used (email/password now, Google/Apple later).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- PROFILES
-- One per learner (adult or child) under an account. Track is derived once
-- from age at profile-creation time (age under 13 -> kid, 13+ -> adult).
-- ============================================================================
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  age smallint not null check (age between 0 and 120),
  native_language text not null,
  starting_proficiency text not null check (
    starting_proficiency in ('none', 'understands_some', 'speaks_not_reads')
  ),
  learning_goal text check (
    learning_goal in ('family', 'travel', 'heritage', 'fun')
  ),
  track text not null check (track in ('kid', 'adult')),
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

create index profiles_account_id_idx on public.profiles (account_id);

-- ============================================================================
-- DAILY GOAL SETTINGS
-- One-to-one with a profile. Editable anytime from that profile's settings.
-- ============================================================================
create table public.daily_goal_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  daily_goal_minutes smallint not null check (daily_goal_minutes in (5, 10, 15)),
  reminder_time time not null,
  reminder_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- CONSENT RECORDS
-- One row per profile, captured during onboarding before the profile becomes
-- usable. is_for_child records whether the adult was consenting on a child's
-- behalf, so the copy/audit trail is explicit either way.
-- ============================================================================
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  is_for_child boolean not null,
  consent_type text not null default 'terms_and_privacy',
  terms_version text not null default 'v1',
  accepted_at timestamptz not null default now()
);

create index consent_records_profile_id_idx on public.consent_records (profile_id);

-- ============================================================================
-- CONTENT LIBRARY: Units -> Lessons -> Words
-- Shared by every profile/track. The adult track just unlocks more exercise
-- types against the same words; content itself is not duplicated per track.
-- ============================================================================
create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  lesson_number int not null,
  title text,
  sort_order int not null default 0
);

create index lessons_unit_id_idx on public.lessons (unit_id);

create table public.words (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  arabic_script text not null,
  transliteration text not null,
  english_meaning text not null,
  -- Path inside the "audio" storage bucket, e.g. "greetings/ahla.mp3".
  -- Nullable: a word can exist before its audio has been recorded.
  audio_path text,
  -- Path inside the "images" storage bucket. Added later; nullable for now.
  image_path text,
  sort_order int not null default 0
);

create index words_lesson_id_idx on public.words (lesson_id);

-- ============================================================================
-- PROGRESS
-- Word-level mastery per profile. Lesson/unit completion is derived from this
-- (a lesson counts as complete once every one of its words has correct_count >= 1),
-- so no separate "completed lessons" table is needed for v1. This table is the
-- foundation a fuller progress dashboard can be built on later.
-- ============================================================================
create table public.progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  word_id uuid not null references public.words (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'learning', 'known')),
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, word_id)
);

create index progress_profile_id_idx on public.progress (profile_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Every account-owned table is scoped to the signed-in user. Content tables
-- (units/lessons/words) are readable by any signed-in user since the library
-- is shared across all profiles/accounts.
-- ============================================================================
alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_goal_settings enable row level security;
alter table public.consent_records enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.words enable row level security;
alter table public.progress enable row level security;

create policy "accounts_select_own" on public.accounts
  for select using (id = auth.uid());
create policy "accounts_update_own" on public.accounts
  for update using (id = auth.uid());

create policy "profiles_all_own" on public.profiles
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

create policy "daily_goal_settings_all_own" on public.daily_goal_settings
  for all using (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  ) with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );

create policy "consent_records_all_own" on public.consent_records
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

create policy "progress_all_own" on public.progress
  for all using (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  ) with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );

create policy "units_read_authenticated" on public.units
  for select using (auth.role() = 'authenticated');
create policy "lessons_read_authenticated" on public.lessons
  for select using (auth.role() = 'authenticated');
create policy "words_read_authenticated" on public.words
  for select using (auth.role() = 'authenticated');

-- ============================================================================
-- STORAGE
-- Public-read buckets for lesson audio/images. Files are named to match
-- words.audio_path / words.image_path exactly.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "audio_public_read" on storage.objects
  for select using (bucket_id = 'audio');
create policy "images_public_read" on storage.objects
  for select using (bucket_id = 'images');
