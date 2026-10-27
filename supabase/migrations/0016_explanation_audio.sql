-- Learn Tunisian: explanation recordings.
--
-- Alongside a word/phrase's pronunciation recording (word_variants.audio_path)
-- an admin can add an optional *explanation* recording — a native speaker
-- explaining it in English, Arabic or both. It gets its own column so the
-- two can never be confused: audio_path stays the only thing Repeat After Me
-- and every exercise play.
--
-- word_variants needs no new policies: writes are already admin-only and
-- reads are unchanged (0009_admin_content_management.sql). The file lives in
-- the same public content bucket, under its own "<variant>-explanation-<ms>"
-- name.
--
-- A translation answer (0015) gets the same optional second recording, in
-- the private translation-audio bucket, readable only by the requester.

alter table public.word_variants
  add column explanation_audio_path text check (char_length(explanation_audio_path) <= 300);

alter table public.translation_requests
  add column answer_explanation_audio_path text check (char_length(answer_explanation_audio_path) <= 300);

-- ============================================================================
-- Admin: set (or clear, with null) a translation answer's explanation.
-- Same rules as admin_set_translation_answer_audio: admin only, the request
-- must still be open, and the path must be inside that request's folder.
-- ============================================================================
create function public.admin_set_translation_explanation_audio(p_request_id uuid, p_audio_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can record translation answers.' using errcode = '42501';
  end if;
  if p_audio_path is not null and not (p_audio_path like p_request_id::text || '/%') then
    raise exception 'invalid_audio_path' using errcode = '22023';
  end if;
  update public.translation_requests
    set answer_explanation_audio_path = p_audio_path, handled_by = auth.uid()
    where id = p_request_id and status in ('submitted', 'in_progress');
  if not found then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  return p_audio_path;
end;
$$;

revoke all on function public.admin_set_translation_explanation_audio(uuid, text) from public, anon;
grant execute on function public.admin_set_translation_explanation_audio(uuid, text) to authenticated;

-- ============================================================================
-- my_translation_requests gains the explanation. Its result columns change,
-- so it has to be dropped and recreated (create or replace can't do that).
-- Same ownership/visibility rules as 0015.
-- ============================================================================
drop function public.my_translation_requests();

create function public.my_translation_requests()
returns table (
  id uuid,
  english_text text,
  status text,
  submitted_at timestamptz,
  due_at timestamptz,
  answered_at timestamptz,
  answer_arabic text,
  answer_transliteration text,
  answer_english text,
  answer_audio_path text,
  answer_explanation_audio_path text,
  is_new boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.english_text,
    case when r.status = 'answered' then 'answered' else 'submitted' end,
    r.submitted_at,
    r.due_at,
    r.answered_at,
    case when r.status = 'answered' then r.answer_arabic end,
    case when r.status = 'answered' then r.answer_transliteration end,
    case when r.status = 'answered' then r.answer_english end,
    case when r.status = 'answered' then r.answer_audio_path end,
    case when r.status = 'answered' then r.answer_explanation_audio_path end,
    r.status = 'answered' and r.answer_seen_at is null
  from public.translation_requests r
  where r.account_id = auth.uid()
    and r.status in ('submitted', 'in_progress', 'answered')
  order by r.submitted_at desc;
$$;

revoke all on function public.my_translation_requests() from public, anon;
grant execute on function public.my_translation_requests() to authenticated;

-- ============================================================================
-- The requester may read their answered request's explanation file too —
-- exactly those two files, nothing wider.
-- ============================================================================
drop policy "translation_audio_read_own_answer" on storage.objects;

create policy "translation_audio_read_own_answer" on storage.objects
  for select using (
    bucket_id = 'translation-audio'
    and (
      public.is_admin()
      or exists (
        select 1 from public.translation_requests r
        where r.account_id = auth.uid()
          and r.status = 'answered'
          and storage.objects.name in (r.answer_audio_path, r.answer_explanation_audio_path)
      )
    )
  );
