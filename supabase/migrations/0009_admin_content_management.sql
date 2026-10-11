-- Learn Tunisian: admin auth + core content CRUD (CMS Phase 1).
--
-- Adds the first role-based access this app has ever had — every policy
-- before this is identity-based (account_id = auth.uid(), or a profile_id
-- subquery). Scoped to one trusted admin account for now (a plain boolean
-- flag, not a role table) — see is_admin() below for why a second admin
-- could be added later without a schema change.

-- ============================================================================
-- ADMIN FLAG + HELPER
-- ============================================================================
alter table public.accounts add column is_admin boolean not null default false;

-- SECURITY DEFINER (same precedent as handle_new_user() in 0001_init.sql) so
-- this can be called from inside other tables' RLS policies regardless of
-- whether accounts' own RLS would allow the read in that context.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.accounts where id = auth.uid()), false);
$$;

-- Guards against privilege escalation: "accounts_update_own" (0001_init.sql)
-- only restricts *which row* can be updated (id = auth.uid()), not which
-- columns/values — with no `with check`, Postgres reuses that same `using`
-- clause as the implicit check. Without this trigger, the moment is_admin
-- exists as a plain column, any signed-in user could run
-- `update accounts set is_admin = true where id = auth.uid()` and succeed.
-- auth.uid() is null outside an app session (migrations, the SQL editor),
-- which is the deliberate escape hatch for the one-time manual bootstrap at
-- the bottom of this file.
create function public.prevent_self_admin_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an existing admin can change is_admin.';
  end if;
  return new;
end;
$$;

create trigger accounts_guard_is_admin
  before update on public.accounts
  for each row execute function public.prevent_self_admin_promotion();

-- ============================================================================
-- REUSABLE updated_at TRIGGER
--
-- No prior precedent in this codebase — every existing updated_at column
-- (progress, daily_goal_settings) is maintained by hand in application code.
-- Using a DB trigger here instead since admin writes land from several
-- different screens, and a trigger is a single point of truth for it.
-- ============================================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- LAST-EDITED METADATA + CONTENT STATUS
--
-- created_by/updated_by/created_at/updated_at added to all four core content
-- tables. content_status is added only to word_groups and word_variants —
-- the two leaf tables learner-facing rows actually live on; units/lessons
-- are structural containers with no status of their own.
--
-- Existing rows default to 'approved' (today's live content — unchanged
-- behavior for current users); the column default is then flipped to
-- 'draft' so every *new* row an admin creates starts hidden until it's
-- explicitly approved.
-- ============================================================================
alter table public.units
  add column created_by uuid references public.accounts (id) on delete set null,
  add column updated_by uuid references public.accounts (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table public.lessons
  add column created_by uuid references public.accounts (id) on delete set null,
  add column updated_by uuid references public.accounts (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter table public.word_groups
  add column content_status text not null default 'approved' check (
    content_status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')
  ),
  add column created_by uuid references public.accounts (id) on delete set null,
  add column updated_by uuid references public.accounts (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
alter table public.word_groups alter column content_status set default 'draft';

alter table public.word_variants
  add column content_status text not null default 'approved' check (
    content_status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')
  ),
  add column created_by uuid references public.accounts (id) on delete set null,
  add column updated_by uuid references public.accounts (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
alter table public.word_variants alter column content_status set default 'draft';

create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger word_groups_set_updated_at before update on public.word_groups
  for each row execute function public.set_updated_at();
create trigger word_variants_set_updated_at before update on public.word_variants
  for each row execute function public.set_updated_at();

-- ============================================================================
-- DATA-INTEGRITY FIX NEEDED BY THE ADMIN UI ITSELF
--
-- lessons has no unique(unit_id, lesson_number) today — harmless while only
-- hand-written SQL migrations create lessons, but word_groups is matched to
-- a lesson by (unit_id, lesson_number), not a foreign key (see
-- 0003_word_variants.sql), so a human accidentally creating two lessons with
-- the same number in the same unit via the new admin screens would silently
-- merge their word_groups together. Closing it now since this phase's own
-- UI is what introduces the risk.
-- ============================================================================
alter table public.lessons
  add constraint lessons_unit_lesson_number_key unique (unit_id, lesson_number);

-- ============================================================================
-- RLS: admin-only writes on the four core content tables.
--
-- No insert/update/delete policy exists on any of these four tables today —
-- with RLS enabled and zero matching policies, those commands are already
-- fully denied to every client role. These policies are purely additive:
-- a normal user's write access stays exactly "none" (unchanged); the admin
-- gains exactly these four tables' write access.
--
-- content_status is deliberately NOT used to filter the existing *read*
-- policies (units_read_authenticated etc. stay untouched) — admin screens
-- need to see draft/pending/rejected rows too, and content_status carries no
-- sensitive data, so there's no security reason to restrict it at the RLS
-- layer. Filtering drafts out of the learner-facing experience is an
-- app-query-layer concern, same precedent as is_curriculum already is (see
-- src/data/content.ts).
-- ============================================================================
create policy "units_insert_admin" on public.units for insert with check (is_admin());
create policy "units_update_admin" on public.units for update using (is_admin()) with check (is_admin());
create policy "units_delete_admin" on public.units for delete using (is_admin());

create policy "lessons_insert_admin" on public.lessons for insert with check (is_admin());
create policy "lessons_update_admin" on public.lessons for update using (is_admin()) with check (is_admin());
create policy "lessons_delete_admin" on public.lessons for delete using (is_admin());

create policy "word_groups_insert_admin" on public.word_groups for insert with check (is_admin());
create policy "word_groups_update_admin" on public.word_groups for update using (is_admin()) with check (is_admin());
create policy "word_groups_delete_admin" on public.word_groups for delete using (is_admin());

create policy "word_variants_insert_admin" on public.word_variants for insert with check (is_admin());
create policy "word_variants_update_admin" on public.word_variants for update using (is_admin()) with check (is_admin());
create policy "word_variants_delete_admin" on public.word_variants for delete using (is_admin());

-- ============================================================================
-- CLOSE THE corrections GAP — split by SQL command, not a blanket is_admin()
-- swap.
--
-- supabase/functions/talk-to-a-tunisian forwards the *calling learner's own*
-- JWT (not service-role) and does a SELECT (daily-cap count) + INSERT (turn
-- logging) against corrections — those must stay open to any authenticated
-- user, just scoped to their own profile's rows (today they're fully open
-- with no ownership check at all). supabase/functions/talk-review does the
-- UPDATE and is only ever invoked from app/admin/corrections.tsx, which this
-- migration's admin flag now gates — that's the one command that should
-- require is_admin(), since reading/resolving every profile's entire
-- pending queue (not just logging your own turns) is the actual gap this
-- phase closes.
-- ============================================================================
drop policy "corrections_all_authenticated" on public.corrections;

create policy "corrections_insert_own_profile" on public.corrections
  for insert with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );

create policy "corrections_select_own_or_admin" on public.corrections
  for select using (
    is_admin() or profile_id in (select id from public.profiles where account_id = auth.uid())
  );

create policy "corrections_update_admin" on public.corrections
  for update using (is_admin()) with check (is_admin());

-- ============================================================================
-- ONE-TIME MANUAL BOOTSTRAP — run by hand in the Supabase SQL editor after
-- this migration, NOT part of the migration itself (there's no app account
-- to promote yet at migration-apply time, and this is a one-person decision,
-- not a repeatable schema change):
--
--   update public.accounts set is_admin = true where email = 'you@example.com';
--
-- auth.uid() is null when run from the SQL editor, so
-- prevent_self_admin_promotion() above does not block it.
-- ============================================================================
