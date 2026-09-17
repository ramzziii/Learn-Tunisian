import { supabase } from '@/lib/supabase/client';
import type { SessionType } from '@/types/models';

export async function recordSessionLog(
  profileId: string,
  sessionType: SessionType,
  durationSeconds: number
): Promise<void> {
  const { error } = await supabase.from('session_logs').insert({
    profile_id: profileId,
    session_type: sessionType,
    duration_seconds: Math.max(0, Math.round(durationSeconds)),
  });
  if (error) throw error;
}

/** Exported so other queries (e.g. fetchTodayPracticeSummary) share the exact
 * same "today" boundary rather than each defining their own. */
export function startOfLocalDayIso(): string {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay.toISOString();
}

/** Total minutes logged today, in the device's local calendar day (not UTC). */
export async function fetchMinutesLearnedToday(profileId: string): Promise<number> {
  const { data, error } = await supabase
    .from('session_logs')
    .select('duration_seconds')
    .eq('profile_id', profileId)
    .gte('completed_at', startOfLocalDayIso());
  if (error) throw error;

  const totalSeconds = (data ?? []).reduce((sum, row) => sum + (row.duration_seconds as number), 0);
  return Math.round(totalSeconds / 60);
}

function toLocalDateKey(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Distinct local-calendar-day dates ("YYYY-MM-DD") with at least one session
 * logged in the last `daysBack` days — feeds calculateStreak() (see
 * src/lib/streak.ts). No dedicated streak table; this derives it from
 * session_logs the same way fetchMinutesLearnedToday derives "today".
 */
export async function fetchRecentActivityDates(profileId: string, daysBack = 60): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { data, error } = await supabase
    .from('session_logs')
    .select('completed_at')
    .eq('profile_id', profileId)
    .gte('completed_at', since.toISOString());
  if (error) throw error;

  const dates = new Set((data ?? []).map((row) => toLocalDateKey(row.completed_at as string)));
  return Array.from(dates);
}
