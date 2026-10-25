-- Learn Tunisian: admin analytics overview (aggregates only).
--
-- Every learner table (accounts, profiles, progress, session_logs) is
-- owner-only under RLS, so an admin client can't — and shouldn't — read other
-- people's rows. This SECURITY DEFINER function is the one place cross-user
-- data is read for analytics: it refuses non-admins inside the database
-- (not just behind the /admin route gate) and returns counts only — no
-- emails, ids, histories or precise locations.
--
-- Definitions (all exclude admin accounts and their profiles, so the team's
-- own testing doesn't inflate the numbers):
--   period            the last p_days whole UTC calendar days including today:
--                     [period_start, period_end), period_end = next UTC midnight.
--   accounts_total    registered accounts created before period_end.
--   accounts_new      accounts created within the period.
--   learner_profiles_total / _new   same, for learner profiles (an account can
--                     hold several, e.g. a parent and a child).
--   active_learners   distinct profiles with ≥1 session_logs row in the period
--                     (written once per lesson / review / Today's Practice
--                     session, when it ends or the learner leaves it).
--   sessions_count    session_logs rows in the period.
--   minutes_learned   sum of those sessions' duration, in whole minutes.
--   words_practiced   (profile, word) pairs whose progress was last updated in
--                     the period — each pair counts once however often it was
--                     practiced. (A pair practiced again later moves forward,
--                     so this is a lower bound for older periods.)
--   words_mastered_total  progress rows currently 'known' (all time, not periodic).
--   countries         learner profiles per country as entered at onboarding,
--                     normalized for case/spacing; countries with fewer than
--                     min_group learners are folded into 'Other'.

create or replace function public.admin_analytics_overview(p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  min_group constant int := 3;
  v_end timestamptz := (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc';
  v_start timestamptz;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'unsupported analytics period: % days', p_days using errcode = '22023';
  end if;
  v_start := v_end - make_interval(days => p_days);

  with learner_accounts as (
    select a.id, a.created_at from public.accounts a where not a.is_admin
  ),
  learner_profiles as (
    select p.id, p.created_at, p.country
    from public.profiles p
    join learner_accounts la on la.id = p.account_id
  ),
  period_sessions as (
    select s.profile_id, s.duration_seconds
    from public.session_logs s
    join learner_profiles lp on lp.id = s.profile_id
    where s.completed_at >= v_start and s.completed_at < v_end
  ),
  countries as (
    select coalesce(nullif(initcap(trim(country)), ''), 'Unknown') as country, count(*)::int as learners
    from learner_profiles
    where created_at < v_end
    group by 1
  ),
  bucketed as (
    select case when learners < min_group then 'Other' else country end as country, sum(learners)::int as learners
    from countries
    group by 1
  )
  select jsonb_build_object(
    'period_start', v_start,
    'period_end', v_end,
    'period_days', p_days,
    'accounts_total', (select count(*) from learner_accounts where created_at < v_end),
    'accounts_new', (select count(*) from learner_accounts where created_at >= v_start and created_at < v_end),
    'learner_profiles_total', (select count(*) from learner_profiles where created_at < v_end),
    'learner_profiles_new', (select count(*) from learner_profiles where created_at >= v_start and created_at < v_end),
    'active_learners', (select count(distinct profile_id) from period_sessions),
    'sessions_count', (select count(*) from period_sessions),
    'minutes_learned', (select coalesce(round(sum(duration_seconds) / 60.0), 0)::int from period_sessions),
    'words_practiced', (
      select count(*)
      from public.progress pr
      join learner_profiles lp on lp.id = pr.profile_id
      where pr.last_seen_at >= v_start and pr.last_seen_at < v_end
    ),
    'words_mastered_total', (
      select count(*)
      from public.progress pr
      join learner_profiles lp on lp.id = pr.profile_id
      where pr.status = 'known'
    ),
    'country_min_group_size', min_group,
    'countries', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('country', country, 'learners', learners)
          order by (country in ('Other', 'Unknown')), learners desc, country
        )
        from bucketed
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_analytics_overview(int) from public;
revoke all on function public.admin_analytics_overview(int) from anon;
grant execute on function public.admin_analytics_overview(int) to authenticated;
