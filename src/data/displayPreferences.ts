import { DEFAULT_DISPLAY_PREFERENCES, parseDisplayPreferences } from '@/lib/display/displayRules';
import { isGuestSessionActive } from '@/lib/guest/guestSession';
import { supabase } from '@/lib/supabase/client';
import type { DisplayPreferences } from '@/types/models';

/**
 * A profile's display preferences (learner_display_preferences, 0023).
 * No row — every learner who never chose — means both/both. Only the
 * profile's own account can read or write it (RLS); it is never sent to
 * analytics or the AI tutor.
 */
export async function fetchDisplayPreferences(profileId: string): Promise<DisplayPreferences> {
  if (isGuestSessionActive()) return DEFAULT_DISPLAY_PREFERENCES;
  const { data, error } = await supabase
    .from('learner_display_preferences')
    .select('script, form')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return parseDisplayPreferences(data as { script?: unknown; form?: unknown } | null);
}

export async function saveDisplayPreferences(profileId: string, preferences: DisplayPreferences): Promise<void> {
  // Guest preview: display settings are not saved anywhere.
  if (isGuestSessionActive()) return;
  const { error } = await supabase
    .from('learner_display_preferences')
    .upsert({ profile_id: profileId, script: preferences.script, form: preferences.form }, { onConflict: 'profile_id' });
  if (error) throw error;
}
