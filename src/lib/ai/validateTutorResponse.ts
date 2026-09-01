import type { SuggestedReply, TutorCorrection, TutorResponse } from '@/lib/ai/types';

// No validation library is installed in this project, and the shape here is
// small and stable enough that hand-rolling it is simpler than adding one.
// The AI's output is never trusted as free-form prose — it must match this
// shape exactly, or the caller treats it as a failed response rather than
// guessing at what the model meant.

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function validateCorrection(value: unknown): TutorCorrection | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    isNonEmptyString(candidate.original) &&
    isNonEmptyString(candidate.corrected) &&
    isNonEmptyString(candidate.explanation)
  ) {
    return { original: candidate.original, corrected: candidate.corrected, explanation: candidate.explanation };
  }
  return undefined;
}

function validateSuggestedReplies(value: unknown): SuggestedReply[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const replies: SuggestedReply[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return undefined;
    const candidate = item as Record<string, unknown>;
    if (!isNonEmptyString(candidate.tunisian) || !isNonEmptyString(candidate.english)) return undefined;
    replies.push({ tunisian: candidate.tunisian, english: candidate.english });
  }
  return replies;
}

/**
 * Parses and validates a raw AI response into a TutorResponse, or returns
 * null if it doesn't match the required shape — the caller (the AI
 * provider) turns that into an `invalid_response` error rather than the app
 * ever rendering unvalidated AI output.
 */
export function validateTutorResponse(raw: unknown): TutorResponse | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (!isNonEmptyString(candidate.tunisian)) return null;
  if (!isNonEmptyString(candidate.english)) return null;
  if (!isOptionalString(candidate.transliteration)) return null;
  if (typeof candidate.continueConversation !== 'boolean') return null;

  const correction = validateCorrection(candidate.correction);
  if (correction === undefined && candidate.correction !== undefined) return null;

  const suggestedReplies = validateSuggestedReplies(candidate.suggestedReplies);
  if (suggestedReplies === undefined && candidate.suggestedReplies !== undefined) return null;

  return {
    tunisian: candidate.tunisian,
    english: candidate.english,
    transliteration: candidate.transliteration,
    correction: correction ?? null,
    suggestedReplies,
    continueConversation: candidate.continueConversation,
  };
}
