-- Learn Tunisian: free sample items — a per-account record of which counted
-- items an account has used, so the free total (5 per feature, guest use
-- included) holds across restarts, reinstalls and devices. The rules live in
-- src/lib/access/accessRules.ts; this table only makes the count reliable.
-- It does not protect content itself (content tables stay readable to any
-- signed-in user — an accepted v1 limitation).
--
-- Deleted with the account: account_id cascades from public.accounts, which
-- delete_account_data (0022) deletes.
-- Tests: supabase/tests/featureClaims.test.mjs.
-- Rollback: supabase/rollbacks/0025_feature_item_claims.rollback.sql.

create table public.feature_item_claims (
  account_id uuid not null references public.accounts (id) on delete cascade,
  feature    text not null check (feature in
               ('lesson','phrasebook_category','grammar_note','proverb','alphabet_letter','repeat_after_me')),
  item_key   text not null check (char_length(item_key) between 1 and 200),
  source     text not null default 'account' check (source in ('account','guest_import')),
  claimed_at timestamptz not null default now(),
  primary key (account_id, feature, item_key)
);

alter table public.feature_item_claims enable row level security;
-- Read your own claims. No insert/update/delete policies: writes happen only
-- through the two functions below.
create policy "feature_item_claims_select_own" on public.feature_item_claims
  for select to authenticated using (account_id = auth.uid());
revoke all on public.feature_item_claims from public, anon, authenticated;
grant select on public.feature_item_claims to authenticated;

-- Claim one item. True = you may open it. Premium (same rule as translation
-- requests: admin or is_premium) is never capped or recorded.
create function public.claim_feature_item(p_feature text, p_item_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_feature is null or p_feature not in
     ('lesson','phrasebook_category','grammar_note','proverb','alphabet_letter','repeat_after_me') then
    raise exception 'invalid_feature' using errcode = '22023';
  end if;
  if p_item_key is null or char_length(p_item_key) not between 1 and 200 then
    raise exception 'invalid_item' using errcode = '22023';
  end if;
  if exists (select 1 from public.feature_item_claims
             where account_id = v_uid and feature = p_feature and item_key = p_item_key) then
    return true;                                   -- already yours: never re-counted
  end if;
  if public.account_has_translation_premium(v_uid) then
    return true;                                   -- Premium: no cap, nothing recorded
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_feature, 0));  -- no double-claim race
  select count(*) into v_count from public.feature_item_claims where account_id = v_uid and feature = p_feature;
  if v_count >= 5 then return false; end if;       -- free total (guest + account) reached
  insert into public.feature_item_claims (account_id, feature, item_key) values (v_uid, p_feature, p_item_key);
  return true;
end;
$$;

-- At sign-up: record the guest's used items (max 2 per feature; extras and
-- unknown features ignored). Idempotent, so a retry never double-counts.
create function public.import_guest_feature_items(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inserted int := 0;
  v_rows int;
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  for r in
    select feature, item_key from (
      select e->>'feature' feature, e->>'item_key' item_key,
             row_number() over (partition by e->>'feature' order by ord) n
      from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    ) s
    where n <= 2
      and feature in ('lesson','phrasebook_category','grammar_note','proverb','alphabet_letter','repeat_after_me')
      and char_length(item_key) between 1 and 200
  loop
    insert into public.feature_item_claims (account_id, feature, item_key, source)
      values (v_uid, r.feature, r.item_key, 'guest_import')
      on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;
  return v_inserted;
end;
$$;

revoke all on function public.claim_feature_item(text, text) from public, anon;
revoke all on function public.import_guest_feature_items(jsonb) from public, anon;
grant execute on function public.claim_feature_item(text, text) to authenticated;
grant execute on function public.import_guest_feature_items(jsonb) to authenticated;
