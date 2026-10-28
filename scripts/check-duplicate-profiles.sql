-- Read-only check: which accounts hold more than one learner profile?
-- Run in the Supabase SQL Editor. It changes nothing.
--
-- 0019_one_profile_per_account.sql stops new duplicates but deliberately
-- leaves existing ones alone. If this returns any rows, those accounts keep
-- all their profiles (the app shows them a one-time chooser) until a cleanup
-- plan has been reviewed and approved. If it returns no rows, a unique index
-- on profiles(account_id) can safely be added in a later migration.

-- 1. Summary.
select count(*) as accounts_with_duplicates,
       coalesce(sum(profile_count), 0) as profiles_on_those_accounts
from (
  select account_id, count(*) as profile_count
  from public.profiles
  group by account_id
  having count(*) > 1
) d;

-- 2. Detail, for review.
select p.account_id, a.email, p.id as profile_id, p.name, p.date_of_birth, p.is_premium, p.created_at
from public.profiles p
join public.accounts a on a.id = p.account_id
where p.account_id in (
  select account_id
  from public.profiles
  group by account_id
  having count(*) > 1
)
order by p.account_id, p.created_at;
