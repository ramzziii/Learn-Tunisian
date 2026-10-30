// When the server's monthly AI budget is used up it answers with
// { error: { kind: 'budget_exhausted' } }. Every client path to a paid AI
// call keeps that kind and shows one friendly message — and the existing
// daily-limit and other errors are unchanged.
const mockInvoke = jest.fn();
const mockFetch = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
  },
  supabaseUrl: 'https://project.test',
  supabaseAnonKey: 'anon-key',
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchTtsAudio, transcribeAudio } = require('@/lib/ai/functionsClient');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { edgeFunctionAiProvider } = require('@/lib/ai/edgeFunctionProvider');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BUDGET_EXHAUSTED_MESSAGE } = require('@/lib/ai/types');

const FRIENDLY = 'Talk to a Tunisian is temporarily unavailable. Please try again later.';

/** The JSON error envelope a function returns, as fetch()/FunctionsHttpError would surface it. */
const envelope = (kind: string, message: string, status: number) => ({
  ok: false,
  status,
  json: async () => ({ error: { kind, message } }),
  clone() {
    return this;
  },
});

const request = {
  scenarioId: 'cafe',
  learnerContext: { level: 'beginner', knownWords: [], strugglingWords: [] },
  vocabulary: [],
  history: [],
  learnerMessage: null,
  profileId: 'p1',
  retrievalQuery: 'aslema',
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockFetch.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = mockFetch;
});

it('the friendly message is the one the spec asks for', () => {
  expect(BUDGET_EXHAUSTED_MESSAGE).toBe(FRIENDLY);
});

describe('text-to-speech and speech-to-text', () => {
  it('budget_exhausted keeps its kind and gets the friendly message (whatever the server text)', async () => {
    mockFetch.mockResolvedValue(envelope('budget_exhausted', 'monthly cap hit', 503));
    expect(await fetchTtsAudio('aslema')).toEqual({ ok: false, error: { kind: 'budget_exhausted', message: FRIENDLY } });

    mockFetch.mockResolvedValue(envelope('budget_exhausted', 'monthly cap hit', 503));
    expect(await transcribeAudio(new Uint8Array([1, 2]), 'audio/m4a')).toEqual({
      ok: false,
      error: { kind: 'budget_exhausted', message: FRIENDLY },
    });
  });

  it('calls the function once — no silent retry of a paid call', async () => {
    mockFetch.mockResolvedValue(envelope('budget_exhausted', 'x', 503));
    await fetchTtsAudio('aslema');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('the daily limit message is unchanged', async () => {
    const message = "You've reached today's audio limit — come back tomorrow!";
    mockFetch.mockResolvedValue(envelope('daily_limit_reached', message, 429));
    expect(await fetchTtsAudio('aslema')).toEqual({ ok: false, error: { kind: 'daily_limit_reached', message } });
  });
});

describe('conversation (talk-to-a-tunisian)', () => {
  it('budget_exhausted keeps its kind and gets the friendly message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: envelope('budget_exhausted', 'cap', 503) } });
    const result = await edgeFunctionAiProvider.generateReply(request);

    expect(result).toEqual({ ok: false, error: { kind: 'budget_exhausted', message: FRIENDLY } });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('the daily limit and other errors are unchanged', async () => {
    const message = "You've reached today's conversation limit — come back tomorrow!";
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: envelope('daily_limit_reached', message, 429) } });
    expect(await edgeFunctionAiProvider.generateReply(request)).toEqual({ ok: false, error: { kind: 'daily_limit_reached', message } });

    mockInvoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: envelope('timeout', 'Timed out', 504) } });
    expect(await edgeFunctionAiProvider.generateReply(request)).toEqual({ ok: false, error: { kind: 'timeout', message: 'Timed out' } });
  });
});
