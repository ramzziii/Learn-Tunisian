-- Learn Tunisian: replace profiles.age with date_of_birth, add country.
-- Run this after 0001_init.sql (and after any earlier run of it) in the
-- Supabase SQL editor.
--
-- Existing rows' date_of_birth is backfilled as an approximation from their
-- stored age and created_at (age -> a Jan 1 birth year), since the app never
-- collected an exact birthdate before this migration. New signups collect
-- the real date of birth going forward.

alter table public.profiles add column date_of_birth date;

update public.profiles
set date_of_birth = make_date(extract(year from created_at)::int - age, 1, 1)
where date_of_birth is null;

alter table public.profiles alter column date_of_birth set not null;
alter table public.profiles drop column age;

alter table public.profiles add column country text;
update public.profiles set country = 'Unknown' where country is null;
alter table public.profiles alter column country set not null;
