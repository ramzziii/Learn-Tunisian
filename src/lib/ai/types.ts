export type ConversationDifficulty = 'beginner' | 'intermediate';

export interface ConversationTurn {
  role: 'tutor' | 'learner';
  text: string;
}

/** One vocabulary item handed to the AI as grounding — the app's DB is the source of truth, this is just what's relevant to the current scenario. */
export interface GroundedVocabularyItem {
  wordGroupId: string;
  englishMeaning: string;
  wordArabic: string;
  transliteration: string;
  /** primary / also_heard / masculine / feminine — see src/lib/wordVariants.ts. */
  variantLabel: string;
  /** False means this exact form hasn't been checked by a native speaker yet — the AI must treat it as draft, not authoritative. */
  nativeVerified: boolean;
}

/** Minimal, non-identifying learner context — no email, no account info, nothing unrelated to learning. */
export interface LearnerContext {
  track: 'kid' | 'adult';
  difficulty: ConversationDifficulty;
  /** English meanings the learner already knows well (status = 'known'), for the tutor to reuse naturally. */
  knownWords: string[];
  /** English meanings the learner has gotten wrong more than they've gotten right, worth reinforcing gently. */
  strugglingWords: string[];
}

export interface ConversationRequest {
  scenarioId: string;
  vocabulary: GroundedVocabularyItem[];
  learnerContext: LearnerContext;
  history: ConversationTurn[];
  /** The learner's newest message — absent only for the tutor's opening line. */
  learnerMessage: string | null;
}

export interface SuggestedReply {
  tunisian: string;
  english: string;
}

export interface TutorCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

/** The AI's response shape — never parsed as free-form prose; see validateTutorResponse.ts. */
export interface TutorResponse {
  tunisian: string;
  english: string;
  transliteration?: string;
  correction?: TutorCorrection | null;
  suggestedReplies?: SuggestedReply[];
  continueConversation: boolean;
}

export interface AiProviderError {
  kind: 'network' | 'timeout' | 'rate_limited' | 'invalid_response' | 'provider_error' | 'not_configured';
  message: string;
}

export interface AiProvider {
  generateReply(request: ConversationRequest): Promise<
    { ok: true; response: TutorResponse } | { ok: false; error: AiProviderError }
  >;
}
