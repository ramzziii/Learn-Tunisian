-- Learn Tunisian: "Words used" — links from a phrase to the words in it.
--
-- A phrase (any word group: a Phrasebook phrase or a multi-word lesson
-- entry) links to existing word groups (lesson words or Phrasebook entries).
-- Each link keeps the word as it appears in this phrase ("Sakker",
-- "el beb") and its position, which is the card order.
--
-- Links are content, not user data: no account columns, so account deletion
-- is unaffected. Signed-in learners can read them (like word_groups; the app
-- shows only approved words and applies the access rules). Only admins can
-- change them, and only through set_phrase_word_links, which replaces a
-- phrase's whole list in one transaction. Guests read only
-- guest_preview_phrase_word_links.

create table public.phrase_word_links (
  phrase_id text not null references public.word_groups (id) on delete cascade,
  word_id text not null references public.word_groups (id) on delete cascade,
  position int not null check (position >= 0),
  shown_arabic text not null check (char_length(btrim(shown_arabic)) between 1 and 100),
  shown_latin text not null check (char_length(btrim(shown_latin)) between 1 and 100),
  updated_at timestamptz not null default now(),
  primary key (phrase_id, word_id),
  constraint phrase_word_links_not_self check (phrase_id <> word_id)
);
create index phrase_word_links_word_idx on public.phrase_word_links (word_id);

alter table public.phrase_word_links enable row level security;
revoke all on public.phrase_word_links from public, anon, authenticated;
grant select on public.phrase_word_links to authenticated;
create policy "phrase_word_links_read_authenticated" on public.phrase_word_links
  for select to authenticated using (true);
-- No insert/update/delete policies: writes go through set_phrase_word_links only.

/**
 * Replaces a phrase's "Words used" list: p_links is a JSON array of
 * { word_id, shown_arabic, shown_latin } in card order. Admins only. Any
 * problem (unknown word, the phrase itself, a word twice, an empty shown
 * form) raises and leaves the previous list untouched.
 */
create function public.set_phrase_word_links(p_phrase_id text, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied: only admins can change Words used' using errcode = '42501';
  end if;
  if jsonb_typeof(p_links) is distinct from 'array' then
    raise exception 'links_must_be_an_array' using errcode = '22023';
  end if;
  if not exists (select 1 from public.word_groups where id = p_phrase_id) then
    raise exception 'unknown_phrase' using errcode = '22023';
  end if;

  delete from public.phrase_word_links where phrase_id = p_phrase_id;
  insert into public.phrase_word_links (phrase_id, word_id, position, shown_arabic, shown_latin)
  select p_phrase_id, l.value ->> 'word_id', (l.ordinality - 1)::int, btrim(l.value ->> 'shown_arabic'), btrim(l.value ->> 'shown_latin')
  from jsonb_array_elements(p_links) with ordinality as l(value, ordinality);
end;
$$;

revoke all on function public.set_phrase_word_links(text, jsonb) from public, anon, authenticated;
grant execute on function public.set_phrase_word_links(text, jsonb) to authenticated;

-- Guests: links of preview phrases to approved words only (same pattern as 0024).
create view public.guest_preview_phrase_word_links with (security_barrier) as
  select k.phrase_id, k.word_id, k.position, k.shown_arabic, k.shown_latin
  from public.phrase_word_links k
  join public.guest_preview_word_groups p on p.id = k.phrase_id
  join public.word_groups w on w.id = k.word_id
  where w.content_status = 'approved';

revoke all on public.guest_preview_phrase_word_links from public, anon, authenticated;
grant select on public.guest_preview_phrase_word_links to anon, authenticated;
