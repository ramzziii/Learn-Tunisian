// Admin side of Request a Translation: the queue, answering (saved before
// anyone is notified), rejecting, and the optional copy into shared content
// (only ever as pending_review, through the existing approval queue).
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockCopy = jest.fn();
const mockRemove = jest.fn();
const mockBuckets: string[] = [];
const mockCreateWordGroup = jest.fn();
const mockCreateWordVariant = jest.fn();
const mockDeleteWordGroup = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockDb.client.from(table),
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    storage: {
      from: (bucket: string) => {
        mockBuckets.push(bucket);
        return { copy: (...a: unknown[]) => mockCopy(bucket, ...a), remove: (...a: unknown[]) => mockRemove(bucket, ...a) };
      },
    },
  },
}));
jest.mock('@/data/admin/content', () => ({
  createWordGroup: (...a: unknown[]) => mockCreateWordGroup(...a),
  createWordVariant: (...a: unknown[]) => mockCreateWordVariant(...a),
  deleteWordGroup: (...a: unknown[]) => mockDeleteWordGroup(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('@/data/admin/translationRequests') as typeof import('@/data/admin/translationRequests');

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1',
  account_id: 'learner-1',
  english_text: 'Where is the market?',
  status: 'submitted',
  submitted_at: '2026-10-26T09:00:00Z',
  due_at: '2026-10-29T23:00:00Z',
  answer_arabic: null,
  answer_transliteration: null,
  answer_english: null,
  answer_audio_path: null,
  answer_explanation_audio_path: null,
  answered_at: null,
  shared_word_group_id: null,
  email_status: null,
  ...overrides,
});

const ANSWER = { arabic: 'وين السوق؟', transliteration: 'win es-souk?', english: 'Where is the market?' };

beforeEach(() => {
  mockDb.reset();
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockInvoke.mockReset().mockResolvedValue({ data: { email: 'sent' }, error: null });
  mockCopy.mockReset().mockResolvedValue({ data: {}, error: null });
  mockRemove.mockReset().mockResolvedValue({ data: [], error: null });
  mockBuckets.length = 0;
  mockCreateWordGroup.mockReset().mockImplementation(async (input: { id: string }) => ({ id: input.id }));
  mockCreateWordVariant.mockReset().mockResolvedValue({ id: 'v-new' });
  mockDeleteWordGroup.mockReset().mockResolvedValue(undefined);
});

describe('listOpenTranslationRequests', () => {
  it('lists only pending requests (submitted or being handled), soonest deadline first', async () => {
    mockDb.respond('translation_requests.select', { data: [row(), row({ id: 'req-2', status: 'in_progress' })], error: null });

    const list = await admin.listOpenTranslationRequests();

    const q = mockDb.queries[0];
    expect(q.table).toBe('translation_requests');
    expect(q.calls).toContainEqual(['in', 'status', ['submitted', 'in_progress']]);
    expect(q.calls).toContainEqual(['order', 'due_at', { ascending: true }]);
    expect(list.map((r) => [r.id, r.status])).toEqual([
      ['req-1', 'submitted'],
      ['req-2', 'in_progress'],
    ]);
    expect(list[0]).toMatchObject({ englishText: 'Where is the market?', submittedAt: '2026-10-26T09:00:00Z', dueAt: '2026-10-29T23:00:00Z' });
  });

  it('a refused read (not an admin under RLS) is an error, not an empty queue', async () => {
    mockDb.respond('translation_requests.select', { data: null, error: { message: 'permission denied', code: '42501' } });
    await expect(admin.listOpenTranslationRequests()).rejects.toThrow(/permission denied/);
  });
});

it('getTranslationRequestAdmin reads one request (null if gone)', async () => {
  mockDb.respond('translation_requests.select', { data: row({ status: 'answered' }), error: null }, { data: null, error: null });
  await expect(admin.getTranslationRequestAdmin('req-1')).resolves.toMatchObject({ id: 'req-1', status: 'answered' });
  await expect(admin.getTranslationRequestAdmin('gone')).resolves.toBeNull();
});

it('mark in progress / reject go through admin-only RPCs', async () => {
  await admin.markTranslationRequestInProgress('req-1');
  await admin.rejectTranslationRequest('req-1');
  expect(mockRpc.mock.calls).toEqual([
    ['admin_mark_translation_request_in_progress', { p_request_id: 'req-1' }],
    ['admin_reject_translation_request', { p_request_id: 'req-1' }],
  ]);
  expect(mockDb.writes()).toEqual([]);
});

it('a request that is no longer open (learner cancelled it) can’t be rejected — says so', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'not_open' } });
  await expect(admin.rejectTranslationRequest('req-1')).rejects.toThrow(/no longer open/);
});

it('setTranslationAnswerAudio stores the uploaded path and returns what the row now holds', async () => {
  mockRpc.mockResolvedValue({ data: 'req-1/answer-5.m4a', error: null });
  await expect(admin.setTranslationAnswerAudio('req-1', 'req-1/answer-5.m4a')).resolves.toBe('req-1/answer-5.m4a');
  expect(mockRpc).toHaveBeenCalledWith('admin_set_translation_answer_audio', { p_request_id: 'req-1', p_audio_path: 'req-1/answer-5.m4a' });
});

it('setTranslationAnswerAudio rejects on failure (so the recorder keeps the old file)', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'not_open' } });
  await expect(admin.setTranslationAnswerAudio('req-1', 'req-1/answer-5.m4a')).rejects.toThrow(/no longer open/);
});

describe('answerTranslationRequest', () => {
  it('saves the complete answer first, then asks the server to email the learner', async () => {
    const result = await admin.answerTranslationRequest('req-1', {
      arabic: ` ${ANSWER.arabic} `,
      transliteration: ANSWER.transliteration,
      english: ANSWER.english,
    });

    expect(mockRpc).toHaveBeenCalledWith('admin_answer_translation_request', {
      p_request_id: 'req-1',
      p_arabic: ANSWER.arabic,
      p_transliteration: ANSWER.transliteration,
      p_english: ANSWER.english,
    });
    expect(mockInvoke).toHaveBeenCalledWith('translation-answered-email', { body: { requestId: 'req-1' } });
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(mockInvoke.mock.invocationCallOrder[0]);
    expect(result).toEqual({ email: 'sent' });
  });

  it('if saving the answer fails, nobody is notified and the error explains it', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'answer_audio_missing' } });

    await expect(admin.answerTranslationRequest('req-1', ANSWER)).rejects.toThrow(/Save the native recording first/);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('a cancelled-meanwhile request is not answered, and nobody is notified', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_open' } });

    await expect(admin.answerTranslationRequest('req-1', ANSWER)).rejects.toThrow(/no longer open/);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('an incomplete answer never reaches the server', async () => {
    await expect(admin.answerTranslationRequest('req-1', { ...ANSWER, transliteration: ' ' })).rejects.toThrow(/required/i);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('email not configured on the server: the answer still stands, and that is reported honestly', async () => {
    mockInvoke.mockResolvedValue({ data: { email: 'not_configured' }, error: null });
    await expect(admin.answerTranslationRequest('req-1', ANSWER)).resolves.toEqual({ email: 'not_configured' });
  });

  it('email function failing: answer still saved, email reported as failed (not sent)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } });
    await expect(admin.answerTranslationRequest('req-1', ANSWER)).resolves.toEqual({
      email: 'failed',
      message: 'Edge Function returned a non-2xx status code',
    });
  });

  it('an unexpected email-function reply is treated as failed, never as sent', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(admin.answerTranslationRequest('req-1', ANSWER)).resolves.toMatchObject({ email: 'failed' });
  });
});

describe('shareTranslationToAppContent', () => {
  const answered = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    answerArabic: ANSWER.arabic,
    answerTransliteration: ANSWER.transliteration,
    answerEnglish: ANSWER.english,
    answerAudioPath: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/answer-5.m4a',
  };
  const share = () => admin.shareTranslationToAppContent({ request: answered, unitId: 'unit-1', lessonNumber: 2, actorAccountId: 'admin-1' });

  it('copies the audio into the public content bucket and adds it for review — never approved directly', async () => {
    const result = await share();

    const groupId = 'tr_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee';
    expect(mockCopy).toHaveBeenCalledWith(
      'translation-audio',
      answered.answerAudioPath,
      expect.stringMatching(new RegExp(`^${groupId}/primary-\\d+\\.m4a$`)),
      { destinationBucket: 'audio' }
    );
    const copiedPath = mockCopy.mock.calls[0][2];
    expect(mockCreateWordGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: groupId, unitId: 'unit-1', lessonNumber: 2, englishMeaning: ANSWER.english, contentStatus: 'pending_review' }),
      'admin-1'
    );
    expect(mockCreateWordVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        wordGroupId: groupId,
        variantLabel: 'primary',
        wordArabic: ANSWER.arabic,
        transliteration: ANSWER.transliteration,
        audioPath: copiedPath,
        contentStatus: 'pending_review',
        isNativeVoice: true,
      }),
      'admin-1'
    );
    expect(mockRpc).toHaveBeenCalledWith('admin_link_translation_shared_content', { p_request_id: answered.id, p_word_group_id: groupId });
    expect(result).toEqual({ wordGroupId: groupId });
    // The learner's private file is never touched.
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('never puts the learner’s original question into shared content — only the curated answer', async () => {
    const withQuestion = { ...answered, englishText: 'PRIVATE: how do I tell my boss I quit' };

    await admin.shareTranslationToAppContent({ request: withQuestion, unitId: 'unit-1', lessonNumber: 2, actorAccountId: 'admin-1' });

    const written = JSON.stringify([mockCreateWordGroup.mock.calls, mockCreateWordVariant.mock.calls, mockCopy.mock.calls]);
    expect(written).not.toContain('PRIVATE');
    expect(mockCreateWordGroup).toHaveBeenCalledWith(expect.objectContaining({ englishMeaning: ANSWER.english }), 'admin-1');
  });

  it('copy fails: nothing is created', async () => {
    mockCopy.mockResolvedValue({ data: null, error: { message: 'The resource already exists' } });
    await expect(share()).rejects.toThrow(/already exists/);
    expect(mockCreateWordGroup).not.toHaveBeenCalled();
  });

  it('creating the variant fails: the half-made group and the copied file are cleaned up, so it can be retried', async () => {
    mockCreateWordVariant.mockRejectedValue(new Error('duplicate key'));

    await expect(share()).rejects.toThrow(/duplicate key/);

    expect(mockDeleteWordGroup).toHaveBeenCalledWith('tr_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee');
    expect(mockRemove).toHaveBeenCalledWith('audio', [mockCopy.mock.calls[0][2]]);
    expect(mockRemove).not.toHaveBeenCalledWith('translation-audio', expect.anything());
  });

  it('linking it to the request fails: also rolled back', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(share()).rejects.toThrow(/permission denied/);
    expect(mockDeleteWordGroup).toHaveBeenCalled();
  });

  it('refuses a request with no saved answer', async () => {
    await expect(
      admin.shareTranslationToAppContent({
        request: { ...answered, answerAudioPath: null },
        unitId: 'unit-1',
        lessonNumber: 1,
        actorAccountId: 'admin-1',
      })
    ).rejects.toThrow(/no saved answer/i);
    expect(mockCopy).not.toHaveBeenCalled();
  });
});

describe('explanation recording on a translation answer', () => {
  it('setTranslationExplanationAudio saves it through its own admin RPC (never the pronunciation one)', async () => {
    mockRpc.mockResolvedValue({ data: 'req-1/explanation-5.m4a', error: null });

    await expect(admin.setTranslationExplanationAudio('req-1', 'req-1/explanation-5.m4a')).resolves.toBe('req-1/explanation-5.m4a');

    expect(mockRpc).toHaveBeenCalledWith('admin_set_translation_explanation_audio', {
      p_request_id: 'req-1',
      p_audio_path: 'req-1/explanation-5.m4a',
    });
  });

  it('a failed explanation save rejects (so the recorder keeps the previous file)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_open' } });
    await expect(admin.setTranslationExplanationAudio('req-1', 'req-1/explanation-5.m4a')).rejects.toThrow(/no longer open/);
  });

  it('the admin read carries the explanation path separately', async () => {
    mockDb.respond('translation_requests.select', { data: row({ answer_explanation_audio_path: 'req-1/explanation-1.m4a' }), error: null });
    await expect(admin.getTranslationRequestAdmin('req-1')).resolves.toMatchObject({
      answerAudioPath: null,
      answerExplanationAudioPath: 'req-1/explanation-1.m4a',
    });
  });
});

describe('shareTranslationToAppContent with recording choices', () => {
  const answered = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    englishText: 'PRIVATE question',
    answerArabic: ANSWER.arabic,
    answerTransliteration: ANSWER.transliteration,
    answerEnglish: ANSWER.english,
    answerAudioPath: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/answer-5.m4a',
    answerExplanationAudioPath: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/explanation-6.mp3',
  };
  const groupId = 'tr_aaaaaaaabbbb4ccc8dddeeeeeeeeeeee';
  const share = (options: { includePronunciation?: boolean; includeExplanation?: boolean }) =>
    admin.shareTranslationToAppContent({ request: answered, unitId: 'unit-1', lessonNumber: 2, actorAccountId: 'admin-1', ...options });
  const variantInput = () => mockCreateWordVariant.mock.calls[0][0] as { audioPath: string | null; explanationAudioPath: string | null };

  it('both: each file is copied to its own public path, and the variant keeps them apart', async () => {
    await share({ includePronunciation: true, includeExplanation: true });

    expect(mockCopy).toHaveBeenCalledTimes(2);
    expect(variantInput().audioPath).toMatch(new RegExp(`^${groupId}/primary-\\d+\\.m4a$`));
    expect(variantInput().explanationAudioPath).toMatch(new RegExp(`^${groupId}/primary-explanation-\\d+\\.mp3$`));
    expect(JSON.stringify(mockCreateWordVariant.mock.calls)).not.toContain('PRIVATE');
  });

  it('pronunciation only', async () => {
    await share({ includePronunciation: true, includeExplanation: false });

    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockCopy.mock.calls[0][1]).toBe(answered.answerAudioPath);
    expect(variantInput().explanationAudioPath).toBeNull();
  });

  it('explanation only: the pronunciation is left for Native Recordings to fill in later', async () => {
    await share({ includePronunciation: false, includeExplanation: true });

    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockCopy.mock.calls[0][1]).toBe(answered.answerExplanationAudioPath);
    expect(variantInput().audioPath).toBeNull();
    expect(variantInput().explanationAudioPath).toMatch(/primary-explanation-\d+\.mp3$/);
  });

  it('still pending review — never approved directly', async () => {
    await share({ includePronunciation: true, includeExplanation: true });
    expect(mockCreateWordGroup).toHaveBeenCalledWith(expect.objectContaining({ contentStatus: 'pending_review' }), 'admin-1');
    expect(mockCreateWordVariant).toHaveBeenCalledWith(expect.objectContaining({ contentStatus: 'pending_review' }), 'admin-1');
  });

  it('a failure after both copies removes both copied files (never the private originals)', async () => {
    mockCreateWordVariant.mockRejectedValue(new Error('duplicate key'));

    await expect(share({ includePronunciation: true, includeExplanation: true })).rejects.toThrow(/duplicate key/);

    const removed = mockRemove.mock.calls.filter((c) => c[0] === 'audio').flatMap((c) => c[1] as string[]);
    expect(removed).toEqual(expect.arrayContaining([mockCopy.mock.calls[0][2], mockCopy.mock.calls[1][2]]));
    expect(mockRemove).not.toHaveBeenCalledWith('translation-audio', expect.anything());
  });

  it('the second copy failing removes the first copy and creates nothing', async () => {
    mockCopy.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });

    await expect(share({ includePronunciation: true, includeExplanation: true })).rejects.toThrow(/Object not found/);

    expect(mockCreateWordGroup).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('audio', [mockCopy.mock.calls[0][2]]);
  });
});
