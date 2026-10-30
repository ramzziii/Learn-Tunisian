-- Learn Tunisian: one learner profile per account.
--
-- An account is one Supabase Auth user (accounts.id = auth.users.id), and
-- Auth allows one user per login email (accounts.email mirrors it — 0018),
-- so "one profile per account" is also "one profile per email".
--
-- profiles_all_own (0001_init.sql) lets a signed-in user insert any number
-- of profiles for their own account straight through the API; the app only
-- ever creates one, but nothing in the database stopped a second. This
-- trigger does, for every caller (app session, service role, SQL editor):
-- a new profile — or an existing one moved to another account — is
-- rejected with `profile_already_exists` / SQLSTATE 23505 when that account
-- already has a profile. The app maps that to ProfileAlreadyExistsError
-- (src/lib/account/profileLimit.ts).
--
-- Why a trigger and not a unique index on profiles(account_id): accounts
-- created before profiles were limited to one may already hold several, and
-- a unique index would fail to build on them — making it build would mean
-- deleting or merging someone's data. The trigger leaves existing rows
-- exactly as they are (and still editable: only a change of account is
-- checked) while making new duplicates impossible. Once
-- scripts/check-duplicate-profiles.sql reports no duplicates, a unique index
-- can be added in a later migration as a second line of defence.
--
-- Concurrency: the account row is locked first, so two simultaneous
-- inserts for the same account run one after the other and the second sees
-- the first's profile.

create function public.enforce_one_profile_per_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.account_id = old.account_id then
    return new;
  end if;

  perform 1 from public.accounts where id = new.account_id for update;

  if exists (
    select 1 from public.profiles
    where account_id = new.account_id and id <> new.id
  ) then
    raise exception 'profile_already_exists' using errcode = '23505',
      detail = 'This account already has a learner profile.',
      hint = 'An account can have only one learner profile.';
  end if;

  return new;
end;
$$;

create trigger profiles_one_per_account
  before insert or update of account_id on public.profiles
  for each row execute function public.enforce_one_profile_per_account();
