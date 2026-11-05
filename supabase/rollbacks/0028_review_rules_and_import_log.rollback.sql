-- Rollback for 0028_review_rules_and_import_log.sql: removes only what it
-- created and restores the guest view exactly as 0024 left it. Run it before
-- rolling back 0026 or 0024.
-- Data lost: the import log (content_import_runs) and every "needs re-check"
-- flag (audio_needs_recheck). Review history written by review_word_variant
-- stays in content_review_events (0026). After this, admins can approve and
-- reject again without being reviewers (as before 0028).
drop table if exists public.content_import_runs;
drop function if exists public.review_word_variant(uuid, text, text, text, text);

-- Guest view back to 0024's definition (a column can't be removed with
-- "create or replace", so it's dropped and recreated with 0024's grants).
drop view if exists public.guest_preview_word_variants;
create view public.guest_preview_word_variants with (security_barrier) as
  select v.id, v.word_group_id, v.variant_label, v.word_arabic, v.transliteration, v.audio_path,
         v.notes, v.sort_order, v.native_verified, v.is_native_voice, v.content_status,
         v.in_repeat_after_me, v.updated_at
  from public.word_variants v join public.guest_preview_word_groups g on g.id = v.word_group_id
  where v.content_status = 'approved';
revoke all on public.guest_preview_word_variants from public, anon, authenticated;
grant select on public.guest_preview_word_variants to anon, authenticated;

drop function if exists public.confirm_audio_matches(uuid);
drop trigger if exists word_variants_guard_audio_recheck on public.word_variants;
drop function if exists public.guard_audio_recheck();
drop table if exists public.audio_recheck_confirmations;
alter table public.word_variants drop column if exists audio_needs_recheck;

drop trigger if exists word_variants_reviewer_approval on public.word_variants;
drop trigger if exists word_groups_reviewer_approval on public.word_groups;
drop function if exists public.enforce_reviewer_approval();
