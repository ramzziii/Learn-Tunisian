import type {
  AccountRow,
  ConsentRecordRow,
  DailyGoalSettingsRow,
  LessonRow,
  ProfileRow,
  ProgressRow,
  UnitRow,
  WordRow,
} from '@/types/database';
import type {
  Account,
  ConsentRecord,
  DailyGoalSettings,
  DailyGoalMinutes,
  Lesson,
  LearningGoal,
  Profile,
  Progress,
  ProgressStatus,
  StartingProficiency,
  Track,
  Unit,
  Word,
} from '@/types/models';

export function mapAccount(row: AccountRow): Account {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    age: row.age,
    nativeLanguage: row.native_language,
    startingProficiency: row.starting_proficiency as StartingProficiency,
    learningGoal: row.learning_goal as LearningGoal | null,
    track: row.track as Track,
    isPremium: row.is_premium,
    createdAt: row.created_at,
  };
}

export function mapDailyGoalSettings(row: DailyGoalSettingsRow): DailyGoalSettings {
  return {
    id: row.id,
    profileId: row.profile_id,
    dailyGoalMinutes: row.daily_goal_minutes as DailyGoalMinutes,
    reminderTime: row.reminder_time,
    reminderEnabled: row.reminder_enabled,
    updatedAt: row.updated_at,
  };
}

export function mapConsentRecord(row: ConsentRecordRow): ConsentRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    profileId: row.profile_id,
    isForChild: row.is_for_child,
    consentType: row.consent_type,
    termsVersion: row.terms_version,
    acceptedAt: row.accepted_at,
  };
}

export function mapUnit(row: UnitRow): Unit {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export function mapLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    unitId: row.unit_id,
    lessonNumber: row.lesson_number,
    title: row.title,
    sortOrder: row.sort_order,
  };
}

export function mapWord(row: WordRow): Word {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    arabicScript: row.arabic_script,
    transliteration: row.transliteration,
    englishMeaning: row.english_meaning,
    audioPath: row.audio_path,
    imagePath: row.image_path,
    sortOrder: row.sort_order,
  };
}

export function mapProgress(row: ProgressRow): Progress {
  return {
    id: row.id,
    profileId: row.profile_id,
    wordId: row.word_id,
    status: row.status as ProgressStatus,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
