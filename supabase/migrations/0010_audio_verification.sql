-- Learn Tunisian: audio verification metadata + admin Storage writes (CMS
-- Phase 2, part 1 — the recording/upload app code lands alongside this).
--
-- native_verified (0006_content_verification.sql) already carries the
-- "has this been checked" boolean — this migration adds who recorded it,
-- how, and who approved it, rather than inventing a second status flag.

alter table public.word_variants
  add column speaker_name text,
  add column dialect_notes text,
  add column is_native_voice boolean not null default false,
  add column approved_by uuid references public.accounts (id) on delete set null,
  add column approved_at timestamptz;

-- ============================================================================
-- STORAGE WRITES — admin only.
--
-- 0001_init.sql only ever granted public *read* on the audio/images buckets;
-- nothing could write to them except the Supabase dashboard/CLI with a
-- service-role key. These are the first insert/update/delete policies either
-- bucket has had.
-- ============================================================================
create policy "audio_admin_write" on storage.objects
  for insert with check (bucket_id = 'audio' and is_admin());
create policy "audio_admin_update" on storage.objects
  for update using (bucket_id = 'audio' and is_admin()) with check (bucket_id = 'audio' and is_admin());
create policy "audio_admin_delete" on storage.objects
  for delete using (bucket_id = 'audio' and is_admin());
