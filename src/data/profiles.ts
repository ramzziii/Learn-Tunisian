import { supabase } from '@/lib/supabase/client';
import { mapDailyGoalSettings, mapProfile } from '@/data/mappers';
import { isProfileAlreadyExistsDbError, ProfileAlreadyExistsError } from '@/lib/account/profileLimit';
import type { DailyGoalSettingsRow, ProfileRow } from '@/types/database';
import type {
  DailyGoalMinutes,
  DailyGoalSettings,
  LearningGoal,
  Profile,
  StartingProficiency,
} from '@/types/models';

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
  dateOfBirth: string;
  nativeLanguage: string;
  country: string;
  startingProficiency: StartingProficiency;
  learningGoal: LearningGoal | null;
}

/**
 * Creates the account's one learner profile. Refuses with
 * ProfileAlreadyExistsError if the account already has one — checked here
 * first, and enforced by the database either way (a race, another device,
 * or a direct API call all get the same rejection).
 */
export async function createProfile(input: NewProfileInput): Promise<Profile> {
  const existing = await supabase.from('profiles').select('id').eq('account_id', input.accountId).limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) throw new ProfileAlreadyExistsError();

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      account_id: input.accountId,
      name: input.name,
      date_of_birth: input.dateOfBirth,
      native_language: input.nativeLanguage,
      country: input.country,
      starting_proficiency: input.startingProficiency,
      learning_goal: input.learningGoal,
      // profiles.track is a required column left from the removed kids
      // track; every profile is an adult profile now.
      track: 'adult',
    })
    .select('*')
    .single<ProfileRow>();
  if (error) throw isProfileAlreadyExistsDbError(error) ? new ProfileAlreadyExistsError() : error;
  return mapProfile(data);
}

export async function createDailyGoalSettings(
  profileId: string,
  dailyGoalMinutes: DailyGoalMinutes,
  reminderTime: string,
  reminderEnabled: boolean
): Promise<DailyGoalSettings> {
  const { data, error } = await supabase
    .from('daily_goal_settings')
    .insert({
      profile_id: profileId,
      daily_goal_minutes: dailyGoalMinutes,
      reminder_time: reminderTime,
      reminder_enabled: reminderEnabled,
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
