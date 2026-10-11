-- Learn Tunisian: correction reason tags (CMS Phase 3).
--
-- corrections already logs every AI-tutor turn and its resolution
-- (0008_talk_rag_content.sql, reviewed via app/admin/corrections.tsx ->
-- talk-review Edge Function) — this adds *why* a correction was needed,
-- not a new review mechanism. The existing table is already the log/
-- training-data record (rows are updated in place on review, never
-- deleted), so there's no separate logging table to add either.

alter table public.corrections
  add column correction_reason text check (
    correction_reason in ('too_formal', 'too_casual', 'dialected', 'incorrect', 'other')
  );
