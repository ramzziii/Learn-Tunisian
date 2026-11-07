-- Rollback for 0029_app_feedback.sql. Data lost: every feedback note.
drop table if exists public.app_feedback;
drop function if exists public.limit_app_feedback();
