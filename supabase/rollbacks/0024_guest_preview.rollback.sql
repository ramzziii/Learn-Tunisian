-- Rollback for 0024_guest_preview.sql: removes only what the migration
-- created, so the content tables' columns, grants and policies return exactly
-- to their state before it (verified in supabase/tests/guestPreview.test.mjs).
drop view if exists public.guest_preview_word_variants;
drop view if exists public.guest_preview_word_groups;
drop view if exists public.guest_preview_lessons;
drop view if exists public.guest_preview_units;
alter table public.word_groups drop column if exists is_guest_preview;
alter table public.lessons     drop column if exists is_guest_preview;
alter table public.units       drop column if exists is_guest_preview;
