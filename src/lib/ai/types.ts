import type { TalkLevel } from '@/lib/talkLevel';

export type { TalkLevel } from '@/lib/talkLevel';

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
  level: TalkLevel;
  /** English meanings the learner already knows well (status = 'known'), for the tutor to reuse naturally. */
  knownWords: string[];
  /** English meanings the learner has gotten wrong more than they've gotten right, worth reinforcing gently. */
  strugglingWords: string[];
}

export interface ConversationRequest {
  scenarioId: string;
  profileId: string;
  vocabulary: GroundedVocabularyItem[];
  learnerContext: LearnerContext;
  history: ConversationTurn[];
  /** The learner's newest message — absent only for the tutor's opening line. */
  learnerMessage: string | null;
  /**
   * What to embed for RAG retrieval (see supabase/functions/talk-to-a-tunisian) —
   * the learner's message, or for the opening line (no message yet), the
   * scenario's title + description. Only used by the live provider; mock
   * ignores it entirely.
   */
  retrievalQuery: string;
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
  kind:
    | 'network'
    | 'timeout'
    | 'rate_limited'
    | 'invalid_response'
    | 'provider_error'
    | 'not_configured'
    | 'daily_limit_reached'
    | 'budget_exhausted'
    | 'budget_check_failed'
    | 'accounting_failed'
    | 'unauthorized'
    | 'forbidden';
  message: string;
}

/**
 * Shown whenever the server's project-wide monthly AI budget is used up
 * (supabase/functions/_shared/aiBudget.ts). Not the learner's fault and not
 * fixed by retrying right away, so it says so plainly.
 */
export const BUDGET_EXHAUSTED_MESSAGE = 'Talk to a Tunisian is temporarily unavailable. Please try again later.';

/** Gives budget_exhausted its one friendly message, whatever text the server sent; other errors pass through. */
export function normalizeAiError(error: AiProviderError): AiProviderError {
  return error.kind === 'budget_exhausted' ? { kind: 'budget_exhausted', message: BUDGET_EXHAUSTED_MESSAGE } : error;
}

export interface AiProvider {
  generateReply(request: ConversationRequest): Promise<
    { ok: true; response: TutorResponse } | { ok: false; error: AiProviderError }
  >;
}
