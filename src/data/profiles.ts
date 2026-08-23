import { supabase } from '@/lib/supabase/client';
import { mapDailyGoalSettings, mapProfile } from '@/data/mappers';
import type { DailyGoalSettingsRow, ProfileRow } from '@/types/database';
import type {
  DailyGoalMinutes,
  DailyGoalSettings,
  LearningGoal,
  Profile,
  StartingProficiency,
  Track,
} from '@/types/models';

const KID_TRACK_MAX_AGE = 12;

export function trackForAge(age: number): Track {
  return age <= KID_TRACK_MAX_AGE ? 'kid' : 'adult';
}

export async function listProfiles(accountId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapProfile);
}

export interface NewProfileInput {
  accountId: string;
  name: string;
  age: number;
  nativeLanguage: string;
  startingProficiency: StartingProficiency;
  learningGoal: LearningGoal | null;
}

export async function createProfile(input: NewProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      account_id: input.accountId,
      name: input.name,
      age: input.age,
      native_language: input.nativeLanguage,
      starting_proficiency: input.startingProficiency,
      learning_goal: input.learningGoal,
      track: trackForAge(input.age),
    })
    .select('*')
    .single<ProfileRow>();
  if (error) throw error;
  return mapProfile(data);
}

export async function createDailyGoalSettings(
  profileId: string,
  dailyGoalMinutes: DailyGoalMinutes,
  reminderTime: string
): Promise<DailyGoalSettings> {
  const { data, error } = await supabase
    .from('daily_goal_settings')
    .insert({
      profile_id: profileId,
      daily_goal_minutes: dailyGoalMinutes,
      reminder_time: reminderTime,
    })
    .select('*')
    .single<DailyGoalSettingsRow>();
  if (error) throw error;
  return mapDailyGoalSettings(data);
}

export async function fetchDailyGoalSettings(profileId: string): Promise<DailyGoalSettings | null> {
  const { data, error } = await supabase
    .from('daily_goal_settings')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle<DailyGoalSettingsRow>();
  if (error) throw error;
  return data ? mapDailyGoalSettings(data) : null;
}

export async function updateDailyGoalSettings(
  profileId: string,
  updates: Partial<{ dailyGoalMinutes: DailyGoalMinutes; reminderTime: string; reminderEnabled: boolean }>
): Promise<DailyGoalSettings> {
  const { data, error } = await supabase
    .from('daily_goal_settings')
    .update({
      ...(updates.dailyGoalMinutes !== undefined && { daily_goal_minutes: updates.dailyGoalMinutes }),
      ...(updates.reminderTime !== undefined && { reminder_time: updates.reminderTime }),
      ...(updates.reminderEnabled !== undefined && { reminder_enabled: updates.reminderEnabled }),
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId)
    .select('*')
    .single<DailyGoalSettingsRow>();
  if (error) throw error;
  return mapDailyGoalSettings(data);
}
