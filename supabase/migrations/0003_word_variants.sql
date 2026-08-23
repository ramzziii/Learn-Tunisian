-- Learn Tunisian: replace the flat `words` table with word_groups + word_variants,
-- so a single concept can have multiple ways of saying it (synonyms via
-- also_heard, or masculine/feminine speaker-gender forms) under one
-- consistent mechanism instead of two separate ones.
--
-- Run this after 0001_init.sql and 0002_profile_dob_country.sql, and before
-- the new seed.sql.

-- ============================================================================
-- WORD GROUPS
-- One row per concept (e.g. "let's go", "I'm hungry"). Deliberately keyed by
-- a readable slug (matching the source spreadsheet's word_group_id, e.g.
-- "letsgo", "im_hungry") rather than a generated UUID, since a non-technical
-- content admin will be looking at this table directly.
--
-- unit_id + lesson_number (not a lessons.id FK) are the two fields this table
-- carries, matching the source spreadsheet's flat shape exactly. The existing
-- `lessons` table is unchanged and still holds lesson title/sort_order/routing
-- identity — the app resolves a word_group's lesson by matching
-- (unit_id, lesson_number) against it, not through a foreign key.
-- ============================================================================
create table public.word_groups (
  id text primary key,
  unit_id uuid not null references public.units (id) on delete cascade,
  lesson_number int not null,
  english_meaning text not null,
  image_keyword text,
  image_path text,
  sort_order int not null default 0
);

create index word_groups_unit_lesson_idx on public.word_groups (unit_id, lesson_number);

-- ============================================================================
-- WORD VARIANTS
-- One row per way of saying a concept. variant_label distinguishes why a
-- variant exists: the default form to teach/quiz (primary), a synonym worth
-- surfacing but not quizzing as the main answer (also_heard), or a
-- speaker-gender form shown as a pair (masculine/feminine).
-- ============================================================================
create table public.word_variants (
  id uuid primary key default gen_random_uuid(),
  word_group_id text not null references public.word_groups (id) on delete cascade,
  variant_label text not null check (
    variant_label in ('primary', 'also_heard', 'masculine', 'feminine')
  ),
  word_arabic text not null,
  transliteration text not null,
  -- Path inside the "audio" storage bucket, e.g. "daily_phrases/lets_go_primary.mp3".
  audio_path text,
  notes text,
  sort_order int not null default 0
);

create index word_variants_group_id_idx on public.word_variants (word_group_id);

-- At most one primary per group (immediate, cheap to check).
create unique index word_variants_one_primary_idx on public.word_variants (word_group_id)
  where variant_label = 'primary';

-- At least one primary per group, UNLESS the group has both a masculine and a
-- feminine variant (those groups are taught/quizzed as a gender pair instead
-- of a single default form — see the app's exercise-generation logic).
-- This has to be a deferred constraint trigger rather than a plain CHECK
-- because it's a cross-row rule (it depends on every variant of a group, not
-- just the row being inserted) and needs to evaluate after a whole batch of
-- inserts for a group lands, not after each individual row.
create function public.check_word_group_has_primary_or_gender_pair()
returns trigger
language plpgsql
as $$
declare
  affected_group_id text := coalesce(new.word_group_id, old.word_group_id);
  primary_count int;
  masculine_count int;
  feminine_count int;
begin
  -- If the group itself is gone too (e.g. cascaded from deleting its unit
  -- or lesson), there's nothing left to validate — skip the check rather
  -- than complaining that a deleted group has no variants.
  if not exists (select 1 from public.word_groups where id = affected_group_id) then
    return null;
  end if;

  select
    count(*) filter (where variant_label = 'primary'),
    count(*) filter (where variant_label = 'masculine'),
    count(*) filter (where variant_label = 'feminine')
  into primary_count, masculine_count, feminine_count
  from public.word_variants
  where word_group_id = affected_group_id;

  if primary_count = 0 and not (masculine_count >= 1 and feminine_count >= 1) then
    raise exception
      'word_group "%" must have exactly one primary variant, or both a masculine and a feminine variant',
      affected_group_id;
  end if;

  return null;
end;
$$;

create constraint trigger word_variants_group_rules
  after insert or update or delete on public.word_variants
  deferrable initially deferred
  for each row execute function public.check_word_group_has_primary_or_gender_pair();

-- ============================================================================
-- PROGRESS: track mastery per word_group (the concept), not per variant —
-- answering with any variant of a group demonstrates knowledge of the same
-- concept, so that's the right grain for "what has this profile learned."
-- ============================================================================
alter table public.progress add column word_group_id text references public.word_groups (id) on delete cascade;
alter table public.progress drop constraint progress_profile_id_word_id_key;
alter table public.progress drop column word_id;
alter table public.progress alter column word_group_id set not null;
alter table public.progress add constraint progress_profile_id_word_group_id_key unique (profile_id, word_group_id);

-- ============================================================================
-- DROP the old flat words table — fully superseded by word_groups/word_variants.
-- ============================================================================
drop table public.words;

-- ============================================================================
-- ROW LEVEL SECURITY — same pattern as units/lessons: shared content library,
-- readable by any signed-in user.
-- ============================================================================
alter table public.word_groups enable row level security;
alter table public.word_variants enable row level security;

create policy "word_groups_read_authenticated" on public.word_groups
  for select using (auth.role() = 'authenticated');
create policy "word_variants_read_authenticated" on public.word_variants
  for select using (auth.role() = 'authenticated');
