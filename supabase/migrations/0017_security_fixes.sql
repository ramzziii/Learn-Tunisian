-- Learn Tunisian: fixes from the run-1 security audit.
--
-- 1. The AI tutor's reference content (phrases, sentences,
--    conversation_examples) could be inserted by ANY signed-in user, with
--    native_verified = true. match_verified_content then fed those rows into
--    every learner's tutor system prompt as the "source of truth". 0008's
--    open insert assumed one trusted household account; since 0009 there
--    are many accounts and an admin role, so writes become admin-only. The
--    seed script uses the service role and talk-review now runs as an admin,
--    so neither is affected. Admins also get update/delete, so a bad row can
--    be fixed or removed without the SQL editor.
--
-- 2. ai_usage_log had one FOR ALL policy for any authenticated user, so any
--    account could read every learner's usage rows (profile ids, models,
--    token counts) and rewrite or delete the cost record. 0009 fixed the
--    identical corrections policy but missed this one. Inserts are now
--    limited to the caller's own profiles (talk-to-a-tunisian logs with the
--    caller's JWT), reads to the owner or an admin, and nobody can update or
--    delete rows from the app.
--
-- 3. translation_audio_read_own_answer (0016) let a learner read their
--    answer audio via a subquery on translation_requests — but learners
--    can't SELECT that table (its only read policy is admin-only, 0015), so
--    the subquery always came back empty and learners could never play
--    their own answers. The ownership check moves into a SECURITY DEFINER
--    helper, the same pattern as is_admin().

-- ============================================================================
-- 1. RAG reference content: admin-only writes
-- ============================================================================
drop policy "phrases_insert_authenticated" on public.phrases;
drop policy "sentences_insert_authenticated" on public.sentences;
drop policy "conversation_examples_insert_authenticated" on public.conversation_examples;

create policy "phrases_insert_admin" on public.phrases
  for insert with check (public.is_admin());
create policy "phrases_update_admin" on public.phrases
  for update using (public.is_admin()) with check (public.is_admin());
create policy "phrases_delete_admin" on public.phrases
  for delete using (public.is_admin());

create policy "sentences_insert_admin" on public.sentences
  for insert with check (public.is_admin());
create policy "sentences_update_admin" on public.sentences
  for update using (public.is_admin()) with check (public.is_admin());
create policy "sentences_delete_admin" on public.sentences
  for delete using (public.is_admin());

create policy "conversation_examples_insert_admin" on public.conversation_examples
  for insert with check (public.is_admin());
create policy "conversation_examples_update_admin" on public.conversation_examples
  for update using (public.is_admin()) with check (public.is_admin());
create policy "conversation_examples_delete_admin" on public.conversation_examples
  for delete using (public.is_admin());

-- ============================================================================
-- 2. ai_usage_log: own rows only (admins read all)
-- ============================================================================
drop policy "ai_usage_log_all_authenticated" on public.ai_usage_log;

create policy "ai_usage_log_insert_own_profile" on public.ai_usage_log
  for insert with check (
    profile_id in (select id from public.profiles where account_id = auth.uid())
  );

create policy "ai_usage_log_select_own_or_admin" on public.ai_usage_log
  for select using (
    public.is_admin() or profile_id in (select id from public.profiles where account_id = auth.uid())
  );

-- ============================================================================
-- 3. Translation answer audio: let the requester read their own files
-- ============================================================================
create function public.can_read_own_translation_audio(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.translation_requests r
    where r.account_id = auth.uid()
      and r.status = 'answered'
      and p_object_name in (r.answer_audio_path, r.answer_explanation_audio_path)
  );
$$;

revoke all on function public.can_read_own_translation_audio(text) from public, anon;
grant execute on function public.can_read_own_translation_audio(text) to authenticated;

drop policy "translation_audio_read_own_answer" on storage.objects;

create policy "translation_audio_read_own_answer" on storage.objects
  for select using (
    bucket_id = 'translation-audio'
    and (public.is_admin() or public.can_read_own_translation_audio(name))
  );
