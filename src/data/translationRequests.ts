import { TRANSLATION_AUDIO_BUCKET } from '@/lib/translationRequests/constants';
import { validateRequestText } from '@/lib/translationRequests/validation';
import { supabase } from '@/lib/supabase/client';

/**
 * Learner side of Request a Translation. Every call is an RPC defined in
 * 0015_translation_requests.sql — the client has no write access to
 * translation_requests at all, so ownership (auth.uid()), the free-request
 * limit and status checks are enforced by the database, not this file.
 */

export { TRANSLATION_AUDIO_BUCKET };
const SIGNED_URL_SECONDS = 60 * 60;

/** Learner-facing statuses are only these two (in_progress shows as submitted). */
export type LearnerTranslationStatus = 'submitted' | 'answered';

export interface TranslationAnswer {
  arabic: string;
  transliteration: string;
  english: string;
  audioPath: string;
  /** Optional explanation recording — separate from the pronunciation. */
  explanationAudioPath: string | null;
}

export interface TranslationRequest {
  id: string;
  englishText: string;
  status: LearnerTranslationStatus;
  submittedAt: string;
  dueAt: string;
  answeredAt: string | null;
  answer: TranslationAnswer | null;
  /** Answered and not yet seen — drives the in-app "your translation is ready" notice. */
  isNewAnswer: boolean;
}

export interface TranslationAllowance {
  isPremium: boolean;
  used: number;
  /** null = unlimited (Premium). */
  remaining: number | null;
}

/** The server refused because this free account has used its one request. */
export class TranslationRequestLimitError extends Error {
  constructor() {
    super('You’ve used your free request. Premium includes unlimited translation requests.');
    this.name = 'TranslationRequestLimitError';
  }
}

interface MyRequestRow {
  id: string;
  english_text: string;
  status: string;
  submitted_at: string;
  due_at: string;
  answered_at: string | null;
  answer_arabic: string | null;
  answer_transliteration: string | null;
  answer_english: string | null;
  answer_audio_path: string | null;
  answer_explanation_audio_path?: string | null;
  is_new: boolean;
}

export async function fetchTranslationAllowance(): Promise<TranslationAllowance> {
  const { data, error } = await supabase.rpc('translation_request_allowance');
  if (error) throw new Error(error.message);
  const row = data as { is_premium: boolean; used: number; remaining: number | null };
  return { isPremium: row.is_premium, used: row.used, remaining: row.remaining };
}

/** Resolves with the request id. `clientRequestId` is the idempotency key —
 * reuse it when retrying the same draft. */
export async function submitTranslationRequest(englishText: string, clientRequestId: string): Promise<string> {
  const validation = validateRequestText(englishText);
  if (!validation.ok) throw new Error(validation.message);

  const { data, error } = await supabase.rpc('submit_translation_request', {
    p_english_text: validation.text,
    p_client_request_id: clientRequestId,
  });
  if (error) {
    if (/free_limit_reached/.test(error.message)) throw new TranslationRequestLimitError();
    throw new Error(`Couldn’t send your request (${error.message}). Please try again.`);
  }
  return data as string;
}

export async function fetchMyTranslationRequests(): Promise<TranslationRequest[]> {
  const { data, error } = await supabase.rpc('my_translation_requests');
  if (error) throw new Error(error.message);
  return ((data ?? []) as MyRequestRow[]).flatMap((row): TranslationRequest[] => {
    // The function already filters these out; this keeps the learner's view
    // to the two simple statuses even if that ever changes.
    if (row.status === 'rejected' || row.status === 'cancelled') return [];
    const isAnswered = row.status === 'answered';
    const answer =
      isAnswered && row.answer_arabic && row.answer_transliteration && row.answer_english && row.answer_audio_path
        ? {
            arabic: row.answer_arabic,
            transliteration: row.answer_transliteration,
            english: row.answer_english,
            audioPath: row.answer_audio_path,
            explanationAudioPath: row.answer_explanation_audio_path ?? null,
          }
        : null;
    return [
      {
        id: row.id,
        englishText: row.english_text,
        status: isAnswered ? 'answered' : 'submitted',
        submittedAt: row.submitted_at,
        dueAt: row.due_at,
        answeredAt: row.answered_at,
        answer,
        isNewAnswer: isAnswered && row.is_new,
      },
    ];
  });
}

export async function cancelTranslationRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_translation_request', { p_request_id: requestId });
  if (error) {
    if (/not_cancellable/.test(error.message)) {
      throw new Error('This request has already been answered or closed, so it can’t be cancelled.');
    }
    throw new Error(`Couldn’t cancel the request (${error.message}).`);
  }
}

export async function markTranslationAnswersSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_translation_answers_seen');
  if (error) throw new Error(error.message);
}

/** A short-lived URL for the answer's native recording (the bucket is private;
 * storage RLS only signs it for the requester or an admin). */
export async function getTranslationAnswerAudioUrl(audioPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(TRANSLATION_AUDIO_BUCKET).createSignedUrl(audioPath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No signed URL returned.');
  return data.signedUrl;
}
