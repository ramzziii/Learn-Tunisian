// Raw row shapes as they come back from Supabase (snake_case, matching the
// SQL column names exactly). UI code should never touch these directly —
// go through src/data/mappers.ts to get the camelCase models in models.ts.

export interface AccountRow {
  id: string;
  email: string;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  account_id: string;
  name: string;
  age: number;
  native_language: string;
  starting_proficiency: string;
  learning_goal: string | null;
  track: string;
  is_premium: boolean;
  created_at: string;
}

export interface DailyGoalSettingsRow {
  id: string;
  profile_id: string;
  daily_goal_minutes: number;
  reminder_time: string;
  reminder_enabled: boolean;
  updated_at: string;
}

export interface ConsentRecordRow {
  id: string;
  account_id: string;
  profile_id: string;
  is_for_child: boolean;
  consent_type: string;
  terms_version: string;
  accepted_at: string;
}

export interface UnitRow {
  id: string;
  name: string;
  sort_order: number;
}

export interface LessonRow {
  id: string;
  unit_id: string;
  lesson_number: number;
  title: string | null;
  sort_order: number;
}

export interface WordRow {
  id: string;
  lesson_id: string;
  arabic_script: string;
  transliteration: string;
  english_meaning: string;
  audio_path: string | null;
  image_path: string | null;
  sort_order: number;
}

export interface ProgressRow {
  id: string;
  profile_id: string;
  word_id: string;
  status: string;
  correct_count: number;
  incorrect_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}
