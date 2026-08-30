-- Learn Tunisian: spaced repetition fields on progress.
--
-- Adds the minimum fields needed to schedule reviews (a simplified SM-2 —
-- see src/lib/spacedRepetition.ts for the calculation) without touching
-- existing columns or losing any learner progress. Every existing row gets
-- default values that make it immediately eligible for review, since it
-- has no prior spaced-repetition history to compute from.
--
-- Run this after 0003_word_variants.sql.

alter table public.progress
  add column next_review_at timestamptz not null default now(),
  add column review_interval_days numeric not null default 0,
  add column ease_factor numeric not null default 2.5,
  add column consecutive_correct int not null default 0,
  add column consecutive_incorrect int not null default 0;

create index progress_next_review_at_idx on public.progress (profile_id, next_review_at);
