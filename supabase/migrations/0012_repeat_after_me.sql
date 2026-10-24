-- Learn Tunisian: "Repeat After Me".
--
-- Marks an admin-recorded word_variant as included in the learner-facing
-- Repeat After Me section. Set only from the admin recorder's opt-in prompt
-- (src/components/admin/AudioRecorderField.tsx). Writes are already
-- admin-only via word_variants_update_admin (0009); reads follow the
-- existing authenticated-read policy, and learner queries additionally
-- require content_status = 'approved' and a non-null audio_path.

alter table public.word_variants
  add column in_repeat_after_me boolean not null default false;

create index word_variants_repeat_after_me_idx
  on public.word_variants (word_group_id)
  where in_repeat_after_me;
