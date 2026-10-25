-- Learn Tunisian: admin "Native Recordings" — permanently skipping a form.
--
-- The admin Native Recordings flow lists every word form without a usable
-- native recording. Skipping a form there sets these, which removes it from
-- that list and shows it under Skipped Recordings instead (where it can
-- still be recorded or put back). Recording it clears them again.
-- Writes are admin-only via word_variants_update_admin (0009).

alter table public.word_variants
  add column recording_skipped_at timestamptz,
  add column recording_skipped_by uuid references public.accounts (id) on delete set null;
