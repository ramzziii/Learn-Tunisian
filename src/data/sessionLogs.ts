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

function startOfLocalDayIso(): string {
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
