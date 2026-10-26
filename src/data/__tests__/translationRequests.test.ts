// Learner side of Request a Translation. Every write is an RPC whose
// SECURITY DEFINER body (0015_translation_requests.sql) re-checks ownership,
// the free-request limit and status — the client never writes the table.
import {
  cancelTranslationRequest,
  fetchMyTranslationRequests,
  fetchTranslationAllowance,
  getTranslationAnswerAudioUrl,
  markTranslationAnswersSeen,
  submitTranslationRequest,
  TranslationRequestLimitError,
} from '@/data/translationRequests';

const mockRpc = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockStorageFrom = jest.fn(() => ({ createSignedUrl: mockCreateSignedUrl }));
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
    storage: { from: (...a: unknown[]) => mockStorageFrom(...(a as [])) },
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockCreateSignedUrl.mockReset();
  mockStorageFrom.mockClear();
  mockFrom.mockReset();
});

describe('submitTranslationRequest', () => {
  it('sends the trimmed text with the idempotency key through the submit RPC (never a direct insert)', async () => {
    mockRpc.mockResolvedValue({ data: 'req-1', error: null });

    await expect(submitTranslationRequest('  How much is this?  ', 'key-1')).resolves.toBe('req-1');

    expect(mockRpc).toHaveBeenCalledWith('submit_translation_request', {
      p_english_text: 'How much is this?',
      p_client_request_id: 'key-1',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('invalid text never reaches the server', async () => {
    await expect(submitTranslationRequest('   ', 'key-1')).rejects.toThrow(/Type the English/);
    await expect(submitTranslationRequest('a'.repeat(501), 'key-1')).rejects.toThrow(/500 characters/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('the server’s free-limit refusal becomes a TranslationRequestLimitError', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'free_limit_reached', code: 'P0001' } });

    const attempt = submitTranslationRequest('Hello', 'key-2');
    await expect(attempt).rejects.toBeInstanceOf(TranslationRequestLimitError);
    await expect(submitTranslationRequest('Hello', 'key-2')).rejects.toThrow(/free request/i);
  });

  it('other failures (offline, not signed in) are reported, not swallowed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(submitTranslationRequest('Hello', 'key-3')).rejects.toThrow(/Couldn.t send your request.*Failed to fetch/);
  });
});

describe('fetchTranslationAllowance', () => {
  it('reads the server’s count for the signed-in account', async () => {
    mockRpc.mockResolvedValue({ data: { is_premium: false, used: 1, remaining: 0 }, error: null });
    await expect(fetchTranslationAllowance()).resolves.toEqual({ isPremium: false, used: 1, remaining: 0 });
    expect(mockRpc).toHaveBeenCalledWith('translation_request_allowance');
  });

  it('Premium is unlimited (remaining: null)', async () => {
    mockRpc.mockResolvedValue({ data: { is_premium: true, used: 7, remaining: null }, error: null });
    await expect(fetchTranslationAllowance()).resolves.toEqual({ isPremium: true, used: 7, remaining: null });
  });

  it('throws when it can’t be read', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(fetchTranslationAllowance()).rejects.toThrow();
  });
});

describe('fetchMyTranslationRequests', () => {
  it('maps the learner-safe rows: just "submitted" or "answered", answer only once answered', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'r2',
          english_text: 'Where is the market?',
          status: 'answered',
          submitted_at: '2026-10-26T09:00:00Z',
          due_at: '2026-10-29T23:00:00Z',
          answered_at: '2026-10-27T10:00:00Z',
          answer_arabic: 'وين السوق؟',
          answer_transliteration: 'win es-souk?',
          answer_english: 'Where is the market?',
          answer_audio_path: 'r2/answer-1.m4a',
          answer_explanation_audio_path: 'r2/explanation-2.m4a',
          is_new: true,
        },
        {
          id: 'r1',
          english_text: 'Thank you',
          status: 'submitted',
          submitted_at: '2026-10-25T09:00:00Z',
          due_at: '2026-10-28T23:00:00Z',
          answered_at: null,
          answer_arabic: null,
          answer_transliteration: null,
          answer_english: null,
          answer_audio_path: null,
          is_new: false,
        },
      ],
      error: null,
    });

    const requests = await fetchMyTranslationRequests();

    expect(mockRpc).toHaveBeenCalledWith('my_translation_requests');
    expect(requests).toEqual([
      {
        id: 'r2',
        englishText: 'Where is the market?',
        status: 'answered',
        submittedAt: '2026-10-26T09:00:00Z',
        dueAt: '2026-10-29T23:00:00Z',
        answeredAt: '2026-10-27T10:00:00Z',
        answer: {
          arabic: 'وين السوق؟',
          transliteration: 'win es-souk?',
          english: 'Where is the market?',
          audioPath: 'r2/answer-1.m4a',
          explanationAudioPath: 'r2/explanation-2.m4a',
        },
        isNewAnswer: true,
      },
      {
        id: 'r1',
        englishText: 'Thank you',
        status: 'submitted',
        submittedAt: '2026-10-25T09:00:00Z',
        dueAt: '2026-10-28T23:00:00Z',
        answeredAt: null,
        answer: null,
        isNewAnswer: false,
      },
    ]);
  });

  it('never lists anything other than submitted/answered, even if a row slipped through', async () => {
    mockRpc.mockResolvedValue({
      data: ['rejected', 'cancelled', 'in_progress'].map((status, i) => ({
        id: `x${i}`,
        english_text: 't',
        status,
        submitted_at: '2026-10-25T09:00:00Z',
        due_at: '2026-10-28T23:00:00Z',
        answered_at: null,
        answer_arabic: null,
        answer_transliteration: null,
        answer_english: null,
        answer_audio_path: null,
        is_new: false,
      })),
      error: null,
    });

    const requests = await fetchMyTranslationRequests();
    // in_progress is an internal admin state: the learner just sees "submitted".
    expect(requests.map((r) => [r.id, r.status])).toEqual([['x2', 'submitted']]);
  });
});

describe('cancelTranslationRequest', () => {
  it('cancels through the RPC (which checks ownership and that it is still pending)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await cancelTranslationRequest('r1');
    expect(mockRpc).toHaveBeenCalledWith('cancel_translation_request', { p_request_id: 'r1' });
  });

  it('an already-answered request can’t be cancelled — says so', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_cancellable' } });
    await expect(cancelTranslationRequest('r1')).rejects.toThrow(/already been answered/);
  });
});

it('markTranslationAnswersSeen clears the "new answer" badge server-side', async () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  await markTranslationAnswersSeen();
  expect(mockRpc).toHaveBeenCalledWith('mark_translation_answers_seen');
});

describe('getTranslationAnswerAudioUrl', () => {
  it('signs a short-lived URL from the private bucket (answers are never public)', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/r2' }, error: null });

    await expect(getTranslationAnswerAudioUrl('r2/answer-1.m4a')).resolves.toBe('https://signed/r2');

    expect(mockStorageFrom).toHaveBeenCalledWith('translation-audio');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('r2/answer-1.m4a', 3600);
  });

  it('throws when signing is refused', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(getTranslationAnswerAudioUrl('r2/answer-1.m4a')).rejects.toThrow(/Object not found/);
  });
});
