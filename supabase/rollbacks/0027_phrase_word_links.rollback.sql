-- Rollback for 0027_phrase_word_links.sql: removes only what it created.
-- Dropping the table deletes every saved "Words used" link. Run it before
-- rolling back 0024: its guest view is built on 0024's guest views.
drop view if exists public.guest_preview_phrase_word_links;
drop function if exists public.set_phrase_word_links(text, jsonb);
drop table if exists public.phrase_word_links;
