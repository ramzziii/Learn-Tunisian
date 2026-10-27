-- One-off cleanup: delete every learner profile whose date of birth makes
-- them under 18 today. The app is adults-only (see CLAUDE.md), so these
-- profiles — the old "kid track" ones — should no longer exist.
--
-- Run in the Supabase SQL Editor. NOT a migration: it's a data operation on
-- the live database, run once, and it cannot be undone. Run STEP 1 first and
-- check the list before running STEP 2.
--
-- What goes with each deleted profile (all ON DELETE CASCADE): its
-- daily_goal_settings, consent_records, progress, favorites, session_logs
-- and Talk corrections rows. ai_usage_log rows are kept with profile_id set
-- to null (ON DELETE SET NULL). The account itself is kept — it belongs to
-- the adult who created the profile. An account left with no profile is sent
-- back through onboarding by the app; one left with a single profile uses it
-- automatically.
--
-- "Under 18" matches isAdult() in src/lib/age.ts: someone turning 18 today
-- is an adult and is kept.

-- STEP 1 — preview (changes nothing).
select p.id, p.account_id, p.name, p.date_of_birth, p.track,
       (select count(*) from public.profiles o where o.account_id = p.account_id) as profiles_on_account
from public.profiles p
where p.date_of_birth > (current_date - interval '18 years')::date
order by p.account_id, p.date_of_birth;

-- STEP 1b — for review only: kid-track profiles that are NOT under 18 by
-- date of birth. Profiles created before 0002 had their date of birth
-- backfilled as January 1 of an estimated year, so a real minor could show
-- up here. STEP 2 does not delete these; decide on them by hand.
select id, account_id, name, date_of_birth, created_at
from public.profiles
where track = 'kid'
  and date_of_birth <= (current_date - interval '18 years')::date;

-- STEP 2 — delete. Run only after checking STEP 1's list.
-- begin;
-- delete from public.profiles
-- where date_of_birth > (current_date - interval '18 years')::date;
-- -- Expect 0:
-- select count(*) from public.profiles
-- where date_of_birth > (current_date - interval '18 years')::date;
-- commit;
