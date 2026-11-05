-- Learn Tunisian: choose the guest preview content (run AFTER migration 0024).
--
-- Guests get the first 2 curriculum lessons (in course order) and 2 phrasebook
-- categories (Greetings + First Encounters), and only the words listed here.
-- Nothing is chosen by unit name, so a duplicate name can't add rows.
--
-- 1. Run the read-only query in docs/APP_GUIDE.md ("Guest preview") on the
--    live database to get the lesson ids and word ids, and check that every
--    word you list is approved. Draft content is never exposed: if a lesson's
--    words aren't approved yet, approve them in the admin tools first.
-- 2. Fill in the four values below (replace each "/*…*/ null").
-- 3. Run this whole script in the SQL editor. Any problem aborts it and
--    flags nothing. Re-running replaces the previous selection.
--
-- Tests: supabase/tests/guestPreview.test.mjs runs this exact file.

do $$
declare
  -- TODO(owner): fill in from the live query. Lessons by id, never by name.
  c_curriculum_lessons uuid[] := /*CURRICULUM_LESSONS*/ null; -- the first 2 lessons in course order
  c_curriculum_words   text[] := /*CURRICULUM_WORDS*/ null;   -- approved words from those 2 lessons
  c_phrasebook_lessons uuid[] := /*PHRASEBOOK_LESSONS*/ null; -- Greetings + First Encounters lesson ids
  c_phrasebook_words   text[] := /*PHRASEBOOK_WORDS*/ null;   -- approved phrases from those 2 categories
  v_first_two uuid[];
  v_words text[];
  v_bad text;
begin
  -- 1. Every value is set; exactly 2 lessons of each kind.
  if coalesce(cardinality(c_curriculum_lessons), 0) <> 2 or coalesce(cardinality(c_phrasebook_lessons), 0) <> 2
     or coalesce(cardinality(c_curriculum_words), 0) = 0 or coalesce(cardinality(c_phrasebook_words), 0) = 0 then
    raise exception 'guest preview: selection not filled in (2 curriculum lessons, 2 categories and their word lists)';
  end if;
  v_words := c_curriculum_words || c_phrasebook_words;

  -- 2. No duplicate word ids.
  if cardinality(v_words) <> (select count(distinct w) from unnest(v_words) w) then
    raise exception 'guest preview: a word id is listed twice';
  end if;

  -- 3. The curriculum lessons are exactly the first two in course order
  --    (unit sort order, then lesson sort order — the order the app uses).
  select array_agg(id) into v_first_two from (
    select l.id from public.lessons l join public.units u on u.id = l.unit_id
    where u.is_curriculum order by u.sort_order, u.id, l.sort_order, l.id limit 2) f;
  if not (c_curriculum_lessons @> v_first_two and v_first_two @> c_curriculum_lessons) then
    raise exception 'guest preview: the curriculum lessons must be the first two in course order';
  end if;

  -- 4. The phrasebook lessons are the categories named Greetings and First
  --    Encounters, picked by id; each must be a phrasebook category, and they
  --    must be the first two categories in order.
  if (select count(*) from public.lessons l join public.units u on u.id = l.unit_id
      where l.id = any (c_phrasebook_lessons) and not u.is_curriculum
        and u.name in ('Greetings', 'First Encounters')) <> 2
     or exists (select 1 from (
          select l.id from public.lessons l join public.units u on u.id = l.unit_id
          where not u.is_curriculum order by u.sort_order, u.id, l.sort_order, l.id limit 2) f
        where not (f.id = any (c_phrasebook_lessons))) then
    raise exception 'guest preview: the categories must be Greetings and First Encounters (the first two categories)';
  end if;

  -- 5. Every listed word exists, is approved, belongs to one of ITS selected
  --    lessons, and has at least one approved form.
  select w into v_bad from unnest(c_curriculum_words) w
   where not exists (
     select 1 from public.word_groups g
     join public.lessons l on l.unit_id = g.unit_id and l.lesson_number = g.lesson_number
     where g.id = w and l.id = any (c_curriculum_lessons) and g.content_status = 'approved'
       and exists (select 1 from public.word_variants v where v.word_group_id = g.id and v.content_status = 'approved'))
   limit 1;
  if v_bad is not null then
    raise exception 'guest preview: word "%" is missing, not approved, has no approved form, or is not in the selected lessons', v_bad;
  end if;
  select w into v_bad from unnest(c_phrasebook_words) w
   where not exists (
     select 1 from public.word_groups g
     join public.lessons l on l.unit_id = g.unit_id and l.lesson_number = g.lesson_number
     where g.id = w and l.id = any (c_phrasebook_lessons) and g.content_status = 'approved'
       and exists (select 1 from public.word_variants v where v.word_group_id = g.id and v.content_status = 'approved'))
   limit 1;
  if v_bad is not null then
    raise exception 'guest preview: word "%" is missing, not approved, has no approved form, or is not in the selected categories', v_bad;
  end if;

  -- 6. Replace any previous selection with exactly this one. Units are flagged
  --    through the selected lessons' unit_id — never by name.
  update public.word_groups set is_guest_preview = false where is_guest_preview;
  update public.lessons set is_guest_preview = false where is_guest_preview;
  update public.units set is_guest_preview = false where is_guest_preview;
  update public.lessons set is_guest_preview = true where id = any (c_curriculum_lessons || c_phrasebook_lessons);
  update public.units set is_guest_preview = true
   where id in (select unit_id from public.lessons where id = any (c_curriculum_lessons || c_phrasebook_lessons));
  update public.word_groups set is_guest_preview = true where id = any (v_words);

  -- 7. Nothing else flagged: exact totals.
  if (select count(*) from public.lessons where is_guest_preview) <> 4
     or (select count(*) from public.units where is_guest_preview)
        <> (select count(distinct unit_id) from public.lessons where id = any (c_curriculum_lessons || c_phrasebook_lessons))
     or (select count(*) from public.word_groups where is_guest_preview) <> cardinality(v_words) then
    raise exception 'guest preview: flagged totals do not match the selection';
  end if;
end $$;
