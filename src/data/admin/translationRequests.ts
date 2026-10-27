import { createWordGroup, createWordVariant, deleteWordGroup } from '@/data/admin/content';
import { TRANSLATION_AUDIO_BUCKET } from '@/lib/translationRequests/constants';
import { validateAnswer, type TranslationAnswerInput } from '@/lib/translationRequests/validation';
import { supabase } from '@/lib/supabase/client';

/**
 * Admin side of Request a Translation. Reads go straight to the table
 * (translation_requests_select_admin); every write is an admin-only RPC
 * from 0015_translation_requests.sql, which re-checks is_admin() and the
 * request's status itself.
 */

export type AdminTranslationStatus = 'submitted' | 'in_progress' | 'answered' | 'rejected' | 'cancelled';

export interface AdminTranslationRequest {
  id: string;
  englishText: string;
  status: AdminTranslationStatus;
  submittedAt: string;
  dueAt: string;
  answerArabic: string | null;
  answerTransliteration: string | null;
  answerEnglish: string | null;
  answerAudioPath: string | null;
  /** Optional explanation recording (0016) — separate from the pronunciation. */
  answerExplanationAudioPath: string | null;
  answeredAt: string | null;
  sharedWordGroupId: string | null;
  emailStatus: 'sent' | 'failed' | 'not_configured' | null;
}

interface TranslationRequestRow {
  id: string;
  english_text: string;
  status: AdminTranslationStatus;
  submitted_at: string;
  due_at: string;
  answer_arabic: string | null;
  answer_transliteration: string | null;
  answer_english: string | null;
  answer_audio_path: string | null;
  answer_explanation_audio_path?: string | null;
  answered_at: string | null;
  shared_word_group_id: string | null;
  email_status: AdminTranslationRequest['emailStatus'];
}

function mapRow(row: TranslationRequestRow): AdminTranslationRequest {
  return {
    id: row.id,
    englishText: row.english_text,
    status: row.status,
    submittedAt: row.submitted_at,
    dueAt: row.due_at,
    answerArabic: row.answer_arabic,
    answerTransliteration: row.answer_transliteration,
    answerEnglish: row.answer_english,
    answerAudioPath: row.answer_audio_path,
    answerExplanationAudioPath: row.answer_explanation_audio_path ?? null,
    answeredAt: row.answered_at,
    sharedWordGroupId: row.shared_word_group_id,
    emailStatus: row.email_status,
  };
}

/** Turns the RPCs' raised codes into something an admin can act on. */
function rpcError(action: string, message: string): Error {
  if (/not_open/.test(message)) return new Error('This request is no longer open — the learner cancelled it, or it was already handled.');
  if (/answer_audio_missing/.test(message)) return new Error('Save the native recording first, then send the answer.');
  if (/invalid_answer/.test(message)) return new Error('Tunisian Arabic, transliteration and English meaning are all required (500 characters max each).');
  return new Error(`Couldn’t ${action} (${message}).`);
}

export async function listOpenTranslationRequests(): Promise<AdminTranslationRequest[]> {
  const { data, error } = await supabase
    .from('translation_requests')
    .select('*')
    .in('status', ['submitted', 'in_progress'])
    .order('due_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TranslationRequestRow[]).map(mapRow);
}

export async function getTranslationRequestAdmin(requestId: string): Promise<AdminTranslationRequest | null> {
  const { data, error } = await supabase.from('translation_requests').select('*').eq('id', requestId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as TranslationRequestRow) : null;
}

export async function markTranslationRequestInProgress(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_mark_translation_request_in_progress', { p_request_id: requestId });
  if (error) throw rpcError('update the request', error.message);
}

export async function rejectTranslationRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reject_translation_request', { p_request_id: requestId });
  if (error) throw rpcError('reject the request', error.message);
}

/** The recorder's persistAudioPath: resolves with the path the row now holds. */
export async function setTranslationAnswerAudio(requestId: string, audioPath: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_set_translation_answer_audio', {
    p_request_id: requestId,
    p_audio_path: audioPath,
  });
  if (error) throw rpcError('save the recording on this request', error.message);
  return (data as string | null) ?? null;
}

/** Same contract as setTranslationAnswerAudio, for the optional explanation recording. */
export async function setTranslationExplanationAudio(requestId: string, audioPath: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_set_translation_explanation_audio', {
    p_request_id: requestId,
    p_audio_path: audioPath,
  });
  if (error) throw rpcError('save the explanation recording on this request', error.message);
  return (data as string | null) ?? null;
}

export type AnswerEmailOutcome =
  | { email: 'sent' | 'not_configured' | 'already_sent' }
  | { email: 'failed'; message: string };

/**
 * Saves the complete answer (the RPC refuses unless the native recording is
 * already on the row and the request is still open) and only then asks the
 * server to email the learner. Rejects — without notifying anyone — if the
 * answer wasn't saved. Once it is saved, an email problem is returned, not
 * thrown: the answer stands and the learner sees it in the app either way.
 */
export async function answerTranslationRequest(requestId: string, input: TranslationAnswerInput): Promise<AnswerEmailOutcome> {
  const validation = validateAnswer(input);
  if (!validation.ok) throw new Error(validation.message);

  const { error } = await supabase.rpc('admin_answer_translation_request', {
    p_request_id: requestId,
    p_arabic: validation.answer.arabic,
    p_transliteration: validation.answer.transliteration,
    p_english: validation.answer.english,
  });
  if (error) throw rpcError('save the answer', error.message);

  return notifyTranslationAnswered(requestId);
}

async function notifyTranslationAnswered(requestId: string): Promise<AnswerEmailOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('translation-answered-email', { body: { requestId } });
    if (error) return { email: 'failed', message: error.message };
    const email = (data as { email?: unknown } | null)?.email;
    if (email === 'sent' || email === 'not_configured' || email === 'already_sent') return { email };
    const message = (data as { message?: unknown } | null)?.message;
    return { email: 'failed', message: typeof message === 'string' ? message : 'Unexpected reply from the email function.' };
  } catch (err) {
    return { email: 'failed', message: err instanceof Error ? err.message : 'unknown error' };
  }
}

/**
 * Copies an answered translation into shared app content — as
 * pending_review, so it only goes live through the existing Approval Queue
 * (learner content queries only ever load 'approved' rows). Only the
 * admin-curated answer is used (Arabic, transliteration, Meaning) — never the
 * learner's question. The admin picks which recordings go with it: the
 * pronunciation and/or the explanation, each *copied* to its own path in the
 * public content bucket (the private originals are never touched). Any
 * failure rolls back what this created, so it can simply be retried.
 */
export async function shareTranslationToAppContent({
  request,
  unitId,
  lessonNumber,
  actorAccountId,
  includePronunciation = true,
  includeExplanation = true,
}: {
  request: Pick<
    AdminTranslationRequest,
    'id' | 'answerArabic' | 'answerTransliteration' | 'answerEnglish' | 'answerAudioPath'
  > & { answerExplanationAudioPath?: string | null };
  unitId: string;
  lessonNumber: number;
  actorAccountId: string;
  includePronunciation?: boolean;
  /** Ignored when the answer has no explanation recording. */
  includeExplanation?: boolean;
}): Promise<{ wordGroupId: string }> {
  const { answerArabic, answerTransliteration, answerEnglish, answerAudioPath } = request;
  const answerExplanationAudioPath = request.answerExplanationAudioPath ?? null;
  if (!answerArabic || !answerTransliteration || !answerEnglish || !answerAudioPath) {
    throw new Error('This request has no saved answer to share.');
  }

  const wordGroupId = `tr_${request.id.replace(/-/g, '')}`;
  const extensionOf = (path: string) => (path.includes('.') ? path.split('.').pop() : 'm4a');
  const copied: string[] = [];
  const removeCopied = () =>
    copied.length
      ? supabase.storage
          .from('audio')
          .remove([...copied])
          .catch(() => undefined)
      : Promise.resolve(undefined);

  const copy = async (from: string, to: string) => {
    const { error } = await supabase.storage.from(TRANSLATION_AUDIO_BUCKET).copy(from, to, { destinationBucket: 'audio' });
    if (error) {
      await removeCopied();
      throw new Error(`Couldn’t copy the recording into app content (${error.message}).`);
    }
    copied.push(to);
    return to;
  };

  const publicAudioPath = includePronunciation
    ? await copy(answerAudioPath, `${wordGroupId}/primary-${Date.now()}.${extensionOf(answerAudioPath)}`)
    : null;
  const publicExplanationPath =
    includeExplanation && answerExplanationAudioPath
      ? await copy(
          answerExplanationAudioPath,
          `${wordGroupId}/primary-explanation-${Date.now()}.${extensionOf(answerExplanationAudioPath)}`
        )
      : null;

  let groupCreated = false;
  try {
    await createWordGroup(
      {
        id: wordGroupId,
        unitId,
        lessonNumber,
        englishMeaning: answerEnglish,
        imageKeyword: null,
        imagePath: null,
        sortOrder: 0,
        contentStatus: 'pending_review',
      },
      actorAccountId
    );
    groupCreated = true;
    await createWordVariant(
      {
        wordGroupId,
        variantLabel: 'primary',
        wordArabic: answerArabic,
        transliteration: answerTransliteration,
        audioPath: publicAudioPath,
        explanationAudioPath: publicExplanationPath,
        notes: 'From a learner translation request',
        sortOrder: 0,
        contentStatus: 'pending_review',
        isNativeVoice: publicAudioPath !== null,
      },
      actorAccountId
    );
    const { error: linkError } = await supabase.rpc('admin_link_translation_shared_content', {
      p_request_id: request.id,
      p_word_group_id: wordGroupId,
    });
    if (linkError) throw new Error(linkError.message);
  } catch (err) {
    if (groupCreated) await deleteWordGroup(wordGroupId).catch(() => undefined);
    await removeCopied();
    throw new Error(`Couldn’t add it to app content (${err instanceof Error ? err.message : 'unknown error'}).`);
  }

  return { wordGroupId };
}
