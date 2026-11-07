import { supabase } from '@/lib/supabase/client';

/** Admin → Feedback (0029): notes from learners, newest first. */
export interface FeedbackNote {
  id: string;
  message: string;
  screen: string | null;
  appVersion: string | null;
  createdAt: string;
  readAt: string | null;
}

interface FeedbackRow {
  id: string;
  message: string;
  screen: string | null;
  app_version: string | null;
  created_at: string;
  read_at: string | null;
}

/** The most recent notes. Who sent them isn't shown — only the note. */
export async function fetchFeedback(limit = 100): Promise<FeedbackNote[]> {
  const { data, error } = await supabase
    .from('app_feedback')
    .select('id, message, screen, app_version, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as FeedbackRow[]).map((r) => ({
    id: r.id,
    message: r.message,
    screen: r.screen,
    appVersion: r.app_version,
    createdAt: r.created_at,
    readAt: r.read_at,
  }));
}

export async function markFeedbackRead(id: string): Promise<void> {
  const { error } = await supabase.from('app_feedback').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
