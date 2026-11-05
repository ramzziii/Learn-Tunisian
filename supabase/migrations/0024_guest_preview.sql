-- Learn Tunisian: guest preview — read-only views of explicitly selected,
-- approved content for signed-out visitors (the anon role). No existing grant
-- or policy is changed; signed-out visitors still get nothing from the real
-- tables.
--
-- This migration selects NOTHING. The owner chooses the guest content and
-- runs scripts/select-guest-preview.sql (with its checks) after looking at the
-- live data; until then the views are empty.
--
-- How it's safe:
-- - The views run with their OWNER's privileges (the role that applies this
--   migration — postgres on Supabase, which owns these tables). A table's owner
--   isn't subject to its row-level security unless FORCE is set, so the views
--   can show the selected rows; their WHERE clauses and column lists are the
--   limit. If the tables had a different owner or FORCE RLS, the views would
--   return nothing (fails closed).
-- - security_barrier: the views' own conditions run before any condition a
--   caller adds, so a caller's filter can't observe hidden rows.
-- - SELECT is the only privilege granted on the views.
-- Supabase's security advisor lists these as "security definer views"; that
-- is intended here. Tests: supabase/tests/guestPreview.test.mjs.
-- Rollback: supabase/rollbacks/0024_guest_preview.rollback.sql.

-- ── Selection flags (default false: nothing is visible unless selected) ──
alter table public.units       add column is_guest_preview boolean not null default false;
alter table public.lessons     add column is_guest_preview boolean not null default false;
alter table public.word_groups add column is_guest_preview boolean not null default false;

-- ── Read-only views: selected + approved rows, listed columns only ──
create view public.guest_preview_units with (security_barrier) as
  select u.id, u.name, u.sort_order, u.is_curriculum
  from public.units u where u.is_guest_preview;

create view public.guest_preview_lessons with (security_barrier) as
  select l.id, l.unit_id, l.lesson_number, l.title, l.sort_order
  from public.lessons l join public.units u on u.id = l.unit_id
  where l.is_guest_preview and u.is_guest_preview;

create view public.guest_preview_word_groups with (security_barrier) as
  select g.id, g.unit_id, g.lesson_number, g.english_meaning, g.image_keyword, g.image_path,
         g.sort_order, g.content_status
  from public.word_groups g
  join public.lessons l on l.unit_id = g.unit_id and l.lesson_number = g.lesson_number
  where g.is_guest_preview and g.content_status = 'approved' and l.is_guest_preview;

create view public.guest_preview_word_variants with (security_barrier) as
  select v.id, v.word_group_id, v.variant_label, v.word_arabic, v.transliteration, v.audio_path,
         v.notes, v.sort_order, v.native_verified, v.is_native_voice, v.content_status,
         v.in_repeat_after_me, v.updated_at
  from public.word_variants v join public.guest_preview_word_groups g on g.id = v.word_group_id
  where v.content_status = 'approved';

-- New views inherit Supabase's default grants (ALL to anon and authenticated),
-- and a single-table view can accept writes: remove everything, SELECT only.
revoke all on public.guest_preview_units, public.guest_preview_lessons,
              public.guest_preview_word_groups, public.guest_preview_word_variants
  from public, anon, authenticated;
grant select on public.guest_preview_units, public.guest_preview_lessons,
                public.guest_preview_word_groups, public.guest_preview_word_variants
  to anon, authenticated;
