/**
 * @jest-environment node
 */
// talk-tts, run for real with fakes: authenticated caller → per-account
// daily quota → monthly budget reservation → paid text-to-speech call →
// usage logged in characters. A paid call never happens unless every check
// before it passed.
import { createFakeBudgetStore } from '@/test-utils/fakeAiBudgetStore';
import { fakeProvider, hang } from '@/test-utils/fakeAiProvider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createTtsHandler } = require('../../../supabase/functions/talk-tts/handler.ts');

const ACCOUNT = 'acc-1';
const audio = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });

function setup(opts: { env?: Record<string, string>; quota?: unknown; store?: ReturnType<typeof createFakeBudgetStore>; speech?: (init: RequestInit) => Response | Promise<Response> } = {}) {
  const store = opts.store ?? createFakeBudgetStore();
  const provider = fakeProvider({ '/audio/speech': opts.speech ?? audio });
  const consumeQuota = jest.fn(async () => opts.quota ?? { allowed: true });
  const env = { AI_API_KEY: 'test-key', ...opts.env };
  const handler = createTtsHandler({
    env: (name: string) => (env as Record<string, string>)[name],
    getUserId: async (token: string) => (token === 'good' ? ACCOUNT : null),
    consumeQuota,
    store,
    fetch: provider.fetch,
    timeoutMs: 50,
    log: jest.fn(),
  });
  return { handler, store, provider, consumeQuota };
}

const req = (body: unknown, token: string | null = 'good') =>
  new Request('https://fn.test/talk-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const errorOf = async (res: Response) => ((await res.json()) as { error: { kind: string; message: string } }).error;

describe('before any paid call', () => {
  it.each([[null], ['bad-token']])('unauthenticated (%p) → 401; no quota, no reservation, no provider call', async (token) => {
    const { handler, store, provider, consumeQuota } = setup();
    const res = await handler(req({ text: 'aslema' }, token as string | null));

    expect(res.status).toBe(401);
    expect((await errorOf(res)).kind).toBe('unauthorized');
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(store.reservations).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('daily limit reached → the same 429 as before; no reservation, no provider call', async () => {
    const { handler, store, provider } = setup({ quota: { allowed: false } });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(429);
    expect(await errorOf(res)).toEqual({ kind: 'daily_limit_reached', message: "You've reached today's audio limit — come back tomorrow!" });
    expect(store.reservations).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('a quota error fails closed (503), and a not_authenticated quota error is a 401', async () => {
    const a = setup({ quota: { error: { message: 'connection refused' } } });
    expect((await a.handler(req({ text: 'x' }))).status).toBe(503);
    expect(a.provider.calls).toHaveLength(0);

    const b = setup({ quota: { error: { code: '42501', message: 'not_authenticated' } } });
    expect((await b.handler(req({ text: 'x' }))).status).toBe(401);
    expect(b.provider.calls).toHaveLength(0);
  });

  it('monthly budget exhausted → 503 budget_exhausted with the friendly message; no provider call', async () => {
    const { handler, provider } = setup({ store: createFakeBudgetStore({ spentUsd: 10 }) });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(503);
    expect(await errorOf(res)).toEqual({
      kind: 'budget_exhausted',
      message: 'Talk to a Tunisian is temporarily unavailable. Please try again later.',
    });
    expect(provider.calls).toHaveLength(0);
  });

  it('the reservation itself failing fails closed; no provider call', async () => {
    const { handler, provider } = setup({ store: createFakeBudgetStore({ fail: { reserve: true } }) });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(503);
    expect((await errorOf(res)).kind).toBe('budget_check_failed');
    expect(provider.calls).toHaveLength(0);
  });

  it('a model with no known price fails closed before the quota is spent', async () => {
    const { handler, provider, consumeQuota } = setup({ env: { AI_TTS_MODEL: 'tts-future' } });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(500);
    expect((await errorOf(res)).kind).toBe('not_configured');
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
  });

  it('missing text → 400 without spending anything', async () => {
    const { handler, provider, consumeQuota } = setup();
    expect((await handler(req({ text: '  ' }))).status).toBe(400);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
  });
});

describe('the paid call', () => {
  it('success: returns the audio and logs one tts row in characters, for the token’s account', async () => {
    const { handler, store, provider } = setup();
    const res = await handler(req({ text: 'aslema, chnowa ahwelek?', accountId: 'someone-else', profileId: 'p-x' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(provider.callsTo('/audio/speech')).toHaveLength(1);
    expect(store.usage).toEqual([
      expect.objectContaining({
        accountId: ACCOUNT,
        profileId: null,
        callType: 'tts',
        model: 'tts-1',
        units: { inputCharacters: 23 },
        costUsd: expect.closeTo((23 * 15) / 1e6, 12),
        usageEstimated: false,
      }),
    ]);
    expect(store.reservations[0]).toMatchObject({ status: 'reconciled', callType: 'tts', accountId: ACCOUNT });
  });

  it('long text is truncated before it is priced and sent', async () => {
    const { handler, store, provider } = setup();
    await handler(req({ text: 'a'.repeat(5000) }));

    const sent = JSON.parse(String(provider.callsTo('/audio/speech')[0].init.body));
    expect(sent.input).toHaveLength(800);
    expect(store.usage[0].units).toEqual({ inputCharacters: 800 });
  });

  it('provider error status → 502, reservation released, nothing logged', async () => {
    const { handler, store } = setup({ speech: () => new Response('nope', { status: 500 }) });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(502);
    expect(store.reservations[0].status).toBe('released');
    expect(store.usage).toHaveLength(0);
  });

  it('timeout → 504, reservation kept as ambiguous (still counted)', async () => {
    const { handler, store } = setup({ speech: hang });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(504);
    expect(store.reservations[0].status).toBe('ambiguous');
  });

  it('a usage-logging failure is reported (500 accounting_failed), not a success with untracked audio', async () => {
    const { handler, store } = setup({ store: createFakeBudgetStore({ fail: { reconcile: true } }) });
    const res = await handler(req({ text: 'aslema' }));

    expect(res.status).toBe(500);
    expect((await errorOf(res)).kind).toBe('accounting_failed');
    expect(store.reservations[0].status).toBe('reserved');
  });
});
