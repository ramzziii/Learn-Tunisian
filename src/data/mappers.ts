import type {
  AccountRow,
  ConsentRecordRow,
  DailyGoalSettingsRow,
  FavoriteRow,
  LessonRow,
  ProfileRow,
  ProgressRow,
  UnitRow,
  WordGroupRow,
  WordVariantRow,
} from '@/types/database';
import type {
  Account,
  ConsentRecord,
  ContentStatus,
  DailyGoalSettings,
  DailyGoalMinutes,
  Favorite,
  Lesson,
  LearningGoal,
  Profile,
  Progress,
  ProgressStatus,
  StartingProficiency,
  Unit,
  VariantLabel,
  WordGroup,
  WordVariant,
} from '@/types/models';

export function mapAccount(row: AccountRow): Account {
  return { id: row.id, email: row.email, createdAt: row.created_at, isAdmin: row.is_admin };
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    nativeLanguage: row.native_language,
    country: row.country,
    startingProficiency: row.starting_proficiency as StartingProficiency,
    learningGoal: row.learning_goal as LearningGoal | null,
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
    consentType: row.consent_type,
    termsVersion: row.terms_version,
    acceptedAt: row.accepted_at,
  };
}

export function mapUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isCurriculum: row.is_curriculum,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    unitId: row.unit_id,
    lessonNumber: row.lesson_number,
    title: row.title,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWordGroup(row: WordGroupRow): WordGroup {
  return {
    id: row.id,
    unitId: row.unit_id,
    lessonNumber: row.lesson_number,
    englishMeaning: row.english_meaning,
    imageKeyword: row.image_keyword,
    imagePath: row.image_path,
    sortOrder: row.sort_order,
    contentStatus: row.content_status as ContentStatus,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWordVariant(row: WordVariantRow): WordVariant {
  return {
    id: row.id,
    wordGroupId: row.word_group_id,
    variantLabel: row.variant_label as VariantLabel,
    wordArabic: row.word_arabic,
    transliteration: row.transliteration,
    audioPath: row.audio_path,
    notes: row.notes,
    sortOrder: row.sort_order,
    nativeVerified: row.native_verified,
    contentStatus: row.content_status as ContentStatus,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    speakerName: row.speaker_name,
    dialectNotes: row.dialect_notes,
    isNativeVoice: row.is_native_voice,
    inRepeatAfterMe: row.in_repeat_after_me === true,
    recordingSkippedAt: row.recording_skipped_at ?? null,
    explanationAudioPath: row.explanation_audio_path ?? null,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
  };
}

export function mapProgress(row: ProgressRow): Progress {
  return {
    id: row.id,
    profileId: row.profile_id,
    wordGroupId: row.word_group_id,
    status: row.status as ProgressStatus,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    nextReviewAt: row.next_review_at,
    reviewIntervalDays: row.review_interval_days,
    easeFactor: row.ease_factor,
    consecutiveCorrect: row.consecutive_correct,
    consecutiveIncorrect: row.consecutive_incorrect,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFavorite(row: FavoriteRow): Favorite {
  return {
    id: row.id,
    profileId: row.profile_id,
    wordGroupId: row.word_group_id,
    createdAt: row.created_at,
  };
}
