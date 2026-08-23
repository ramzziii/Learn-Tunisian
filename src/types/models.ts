// Data models mirroring the Supabase schema in supabase/migrations/0001_init.sql.
// Keep these in sync with the SQL by hand for now (no codegen in v1).

export type Track = 'kid' | 'adult';

export type StartingProficiency =
  | 'none' // "No Arabic at all"
  | 'understands_some' // "Understand some, can't speak"
  | 'speaks_not_reads'; // "Speak but can't read"

export type LearningGoal = 'family' | 'travel' | 'heritage' | 'fun';

export type ProgressStatus = 'new' | 'learning' | 'known';

export type DailyGoalMinutes = 5 | 10 | 15;

export interface Account {
  id: string;
  email: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  accountId: string;
  name: string;
  age: number;
  nativeLanguage: string;
  startingProficiency: StartingProficiency;
  learningGoal: LearningGoal | null;
  track: Track;
  isPremium: boolean;
  createdAt: string;
}

export interface DailyGoalSettings {
  id: string;
  profileId: string;
  dailyGoalMinutes: DailyGoalMinutes;
  reminderTime: string; // "HH:mm:ss" (Postgres time)
  reminderEnabled: boolean;
  updatedAt: string;
}

export interface ConsentRecord {
  id: string;
  accountId: string;
  profileId: string;
  isForChild: boolean;
  consentType: string;
  termsVersion: string;
  acceptedAt: string;
}

export interface Unit {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Lesson {
  id: string;
  unitId: string;
  lessonNumber: number;
  title: string | null;
  sortOrder: number;
}

export interface Word {
  id: string;
  lessonId: string;
  arabicScript: string;
  transliteration: string;
  englishMeaning: string;
  audioPath: string | null;
  imagePath: string | null;
  sortOrder: number;
}

export interface Progress {
  id: string;
  profileId: string;
  wordId: string;
  status: ProgressStatus;
  correctCount: number;
  incorrectCount: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Convenience shape for rendering the lesson map: a lesson with its
// derived unlock/completion state for one profile.
export interface LessonWithState extends Lesson {
  unitName: string;
  wordCount: number;
  masteredCount: number;
  state: 'locked' | 'unlocked' | 'completed';
}
