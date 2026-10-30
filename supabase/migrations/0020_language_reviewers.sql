-- Learn Tunisian: restrict review and verification of AI language content.
--
-- The review workflow checks AI-generated Tunisian Arabic (phrases,
-- sentences, conversation turns) for accuracy and naturalness; an approved
-- row becomes native-verified material the tutor treats as the source of
-- truth (match_verified_content, 0008). That decision now belongs to an
-- explicit allowlist of language reviewers, separate from admin status:
--
-- 1. public.reviewers — the allowlist. Created EMPTY; reviewers are added
--    by hand in the SQL editor (docs/language-review.md). Clients may only
--    see whether their own user id is listed; nobody can write it from the
--    app (no write policy, and write privileges revoked).
--
-- 2. corrections (the review queue): readable only by reviewers. Learners
--    could read their own logged turns (nothing in the app does) and admins
--    could read and update every row; now learners can only log new,
--    still-pending turns for their own profile (talk-to-a-tunisian does this
--    with the caller's JWT), and no client can update or delete a row —
--    talk-review resolves rows with the service role after its own reviewer
--    check.
--
-- 3. phrases / sentences / conversation_examples: no client writes at all.
--    0017 allowed admins to insert/update/delete directly; no app code does,
--    and promotion goes through talk-review (service role) and the seed
--    script (service role). Learners' reads of verified rows are unchanged
--    (the *_read_verified policies from 0008 stay as they are).
--
-- The service role bypasses RLS and keeps its own privileges, so the
-- server-side paths above are unaffected.

-- ============================================================================
-- 1. Reviewer allowlist
-- ============================================================================
create table public.reviewers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.reviewers enable row level security;

create policy "reviewers_select_own" on public.reviewers
  for select to authenticated using (user_id = auth.uid());

revoke all on public.reviewers from public, anon, authenticated;
grant select on public.reviewers to authenticated;

-- "Am I a reviewer?" — answers for the caller only. SECURITY DEFINER so RLS
-- policies on other tables can use it, same pattern as is_admin() (0009).
create function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reviewers where user_id = auth.uid());
$$;

revoke all on function public.is_reviewer() from public, anon;
grant execute on function public.is_reviewer() to authenticated;

-- ============================================================================
-- 2. corrections: reviewers read; learners log pending turns; no client updates
-- ============================================================================
drop policy "corrections_select_own_or_admin" on public.corrections;
drop policy "corrections_update_admin" on public.corrections;
drop policy "corrections_insert_own_profile" on public.corrections;

create policy "corrections_select_reviewer" on public.corrections
  for select to authenticated using (public.is_reviewer());

create policy "corrections_insert_pending_own_profile" on public.corrections
  for insert to authenticated with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
    and is_correct is null
    and corrected_text is null
    and reviewer_name is null
    and reviewed_at is null
    and correction_reason is null
  );

revoke all on public.corrections from anon;
revoke update, delete, truncate on public.corrections from anon, authenticated;

-- ============================================================================
-- 3. Verified content: written only by the server-side review flow
-- ============================================================================
drop policy "phrases_insert_admin" on public.phrases;
drop policy "phrases_update_admin" on public.phrases;
drop policy "phrases_delete_admin" on public.phrases;
drop policy "sentences_insert_admin" on public.sentences;
drop policy "sentences_update_admin" on public.sentences;
drop policy "sentences_delete_admin" on public.sentences;
drop policy "conversation_examples_insert_admin" on public.conversation_examples;
drop policy "conversation_examples_update_admin" on public.conversation_examples;
drop policy "conversation_examples_delete_admin" on public.conversation_examples;

revoke insert, update, delete, truncate on public.phrases from anon, authenticated;
revoke insert, update, delete, truncate on public.sentences from anon, authenticated;
revoke insert, update, delete, truncate on public.conversation_examples from anon, authenticated;
