-- Learn Tunisian: content verification signal.
--
-- Deliberately minimal — a single boolean, not a full publishing/status
-- pipeline (that's an explicitly deferred admin-CMS backlog item). This
-- just gives the app an honest way to tell a learner "this hasn't been
-- checked by a native speaker yet" instead of silently presenting draft
-- content as if it were finished. Defaults to false, matching the current
-- reality of every word_variant in supabase/seed.sql.

alter table public.word_variants add column native_verified boolean not null default false;
