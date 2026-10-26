// The same limits are enforced again in the database
// (0015_translation_requests.sql) — these just give a clear message first.
export const MAX_REQUEST_LENGTH = 500;
export const MAX_ANSWER_FIELD_LENGTH = 500;

export function validateRequestText(raw: string): { ok: true; text: string } | { ok: false; message: string } {
  const text = raw.trim();
  if (!text) return { ok: false, message: 'Type the English phrase or sentence you want translated.' };
  if (text.length > MAX_REQUEST_LENGTH) {
    return { ok: false, message: `Keep it to ${MAX_REQUEST_LENGTH} characters or fewer (this is ${text.length}).` };
  }
  return { ok: true, text };
}

export interface TranslationAnswerInput {
  arabic: string;
  transliteration: string;
  english: string;
}

export function validateAnswer(
  raw: TranslationAnswerInput
): { ok: true; answer: TranslationAnswerInput } | { ok: false; message: string } {
  const answer = { arabic: raw.arabic.trim(), transliteration: raw.transliteration.trim(), english: raw.english.trim() };
  if (!answer.arabic || !answer.transliteration || !answer.english) {
    return { ok: false, message: 'Tunisian Arabic, transliteration and English meaning are all required.' };
  }
  if (Object.values(answer).some((value) => value.length > MAX_ANSWER_FIELD_LENGTH)) {
    return { ok: false, message: `Each field must be ${MAX_ANSWER_FIELD_LENGTH} characters or fewer.` };
  }
  return { ok: true, answer };
}

/**
 * A v4 UUID used as the submit idempotency key: the server returns the
 * existing request for a repeated key, so a double tap or a retry after a
 * lost response can't create a second request. Not a secret, so
 * Math.random is fine (Hermes has no crypto.getRandomValues by default).
 */
export function createClientRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
