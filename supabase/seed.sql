-- Learn Tunisian: placeholder seed data
-- Matches tunisian_arabic_SAMPLE_placeholder_data.xlsx (fake words, real English
-- meanings) so the app has something to render end-to-end before real content
-- and audio are ready. Safe to re-run: it clears and re-inserts the 3 starter
-- units. Run this AFTER 0001_init.sql.
--
-- When real content is ready: replace the VALUES below with rows from
-- tunisian_arabic_lesson_content_template.xlsx (same unit/lesson_number/word
-- shape) and upload matching audio files to the "audio" storage bucket under
-- the paths referenced here (e.g. "greetings/hello.mp3").

delete from public.words where lesson_id in (
  select id from public.lessons where unit_id in (
    select id from public.units where name in ('Greetings', 'Family', 'Numbers')
  )
);
delete from public.lessons where unit_id in (
  select id from public.units where name in ('Greetings', 'Family', 'Numbers')
);
delete from public.units where name in ('Greetings', 'Family', 'Numbers');

with unit_greetings as (
  insert into public.units (name, sort_order) values ('Greetings', 1)
  returning id
),
unit_family as (
  insert into public.units (name, sort_order) values ('Family', 2)
  returning id
),
unit_numbers as (
  insert into public.units (name, sort_order) values ('Numbers', 3)
  returning id
),
lesson_greetings as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Greetings', 1 from unit_greetings
  returning id
),
lesson_family as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 2, 'Family', 1 from unit_family
  returning id
),
lesson_numbers as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 3, 'Numbers', 1 from unit_numbers
  returning id
)
insert into public.words (lesson_id, arabic_script, transliteration, english_meaning, audio_path, sort_order)
select id, v.arabic, v.translit, v.english, v.audio, v.ord
from lesson_greetings, (values
  ('[hello]', '[ahla-placeholder]', 'hello', 'greetings/placeholder_hello.mp3', 1),
  ('[bye]', '[bslema-placeholder]', 'bye', 'greetings/placeholder_bye.mp3', 2),
  ('[please]', '[please-placeholder]', 'please', 'greetings/placeholder_please.mp3', 3),
  ('[thankyou]', '[thanks-placeholder]', 'thank you', 'greetings/placeholder_thank_you.mp3', 4),
  ('[yes]', '[yes-placeholder]', 'yes', 'greetings/placeholder_yes.mp3', 5),
  ('[no]', '[no-placeholder]', 'no', 'greetings/placeholder_no.mp3', 6)
) as v(arabic, translit, english, audio, ord)
union all
select id, v.arabic, v.translit, v.english, v.audio, v.ord
from lesson_family, (values
  ('[mom]', '[mama-placeholder]', 'mom', 'family/placeholder_mom.mp3', 1),
  ('[dad]', '[baba-placeholder]', 'dad', 'family/placeholder_dad.mp3', 2),
  ('[grandma]', '[jida-placeholder]', 'grandma', 'family/placeholder_grandma.mp3', 3),
  ('[grandpa]', '[jido-placeholder]', 'grandpa', 'family/placeholder_grandpa.mp3', 4),
  ('[sister]', '[okhtou-placeholder]', 'sister', 'family/placeholder_sister.mp3', 5),
  ('[brother]', '[khouya-placeholder]', 'brother', 'family/placeholder_brother.mp3', 6)
) as v(arabic, translit, english, audio, ord)
union all
select id, v.arabic, v.translit, v.english, v.audio, v.ord
from lesson_numbers, (values
  ('[one]', '[wahad-placeholder]', 'one', 'numbers/placeholder_one.mp3', 1),
  ('[two]', '[zouz-placeholder]', 'two', 'numbers/placeholder_two.mp3', 2),
  ('[three]', '[tlata-placeholder]', 'three', 'numbers/placeholder_three.mp3', 3),
  ('[four]', '[arbaa-placeholder]', 'four', 'numbers/placeholder_four.mp3', 4),
  ('[five]', '[khamsa-placeholder]', 'five', 'numbers/placeholder_five.mp3', 5)
) as v(arabic, translit, english, audio, ord);
