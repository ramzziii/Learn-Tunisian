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
  /** ISO date string ("YYYY-MM-DD"). Use calculateAge() from @/lib/age for a display age. */
  dateOfBirth: string;
  nativeLanguage: string;
  country: string;
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

export type VariantLabel = 'primary' | 'also_heard' | 'masculine' | 'feminine';

/** One concept (e.g. "let's go", "I'm hungry") — a lesson teaches/quizzes one word_group at a time. */
export interface WordGroup {
  id: string;
  unitId: string;
  lessonNumber: number;
  englishMeaning: string;
  imageKeyword: string | null;
  imagePath: string | null;
  sortOrder: number;
}

/** One way of saying a word_group's concept — the primary/default form, a synonym, or a speaker-gender form. */
export interface WordVariant {
  id: string;
  wordGroupId: string;
  variantLabel: VariantLabel;
  wordArabic: string;
  transliteration: string;
  audioPath: string | null;
  notes: string | null;
  sortOrder: number;
}

/**
 * A word_group with all of its variants resolved — this is what the app
 * actually renders and quizzes against everywhere. Every group has either
 * exactly one 'primary' variant, or both a 'masculine' and a 'feminine' one
 * (enforced by a DB constraint) — see src/lib/wordVariants.ts for the
 * helpers that navigate this shape.
 */
export interface WordGroupWithVariants extends WordGroup {
  variants: WordVariant[];
}

export interface Progress {
  id: string;
  profileId: string;
  wordGroupId: string;
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
