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
  date_of_birth: string;
  native_language: string;
  country: string;
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

export interface WordGroupRow {
  id: string;
  unit_id: string;
  lesson_number: number;
  english_meaning: string;
  image_keyword: string | null;
  image_path: string | null;
  sort_order: number;
}

export interface WordVariantRow {
  id: string;
  word_group_id: string;
  variant_label: string;
  word_arabic: string;
  transliteration: string;
  audio_path: string | null;
  notes: string | null;
  sort_order: number;
  native_verified: boolean;
}

export interface ProgressRow {
  id: string;
  profile_id: string;
  word_group_id: string;
  status: string;
  correct_count: number;
  incorrect_count: number;
  next_review_at: string;
  review_interval_days: number;
  ease_factor: number;
  consecutive_correct: number;
  consecutive_incorrect: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FavoriteRow {
  id: string;
  profile_id: string;
  word_group_id: string;
  created_at: string;
}

export interface SessionLogRow {
  id: string;
  profile_id: string;
  session_type: string;
  duration_seconds: number;
  completed_at: string;
}

export interface CorrectionRow {
  id: string;
  profile_id: string;
  ai_generated_text: string;
  target_table: string;
  is_correct: boolean | null;
  corrected_text: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}
