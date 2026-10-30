/**
 * @jest-environment node
 */
// talk-stt, run for real with fakes: authenticated caller → per-account
// daily quota → monthly budget reservation (upper bound from the file size)
// → paid transcription → usage logged in audio seconds.
import { createFakeBudgetStore } from '@/test-utils/fakeAiBudgetStore';
import { fakeProvider, hang, json } from '@/test-utils/fakeAiProvider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createSttHandler } = require('../../../supabase/functions/talk-stt/handler.ts');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const budget = require('../../../supabase/functions/_shared/aiBudget.ts');

const ACCOUNT = 'acc-1';

function setup(
  opts: { env?: Record<string, string>; quota?: unknown; store?: ReturnType<typeof createFakeBudgetStore>; transcribe?: (init: RequestInit) => Response | Promise<Response> } = {}
) {
  const store = opts.store ?? createFakeBudgetStore();
  const provider = fakeProvider({ '/audio/transcriptions': opts.transcribe ?? (() => json({ text: 'عسلامة', duration: 4.2 })) });
  const consumeQuota = jest.fn(async () => opts.quota ?? { allowed: true });
  const env = { AI_API_KEY: 'test-key', ...opts.env };
  const handler = createSttHandler({
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

const audioReq = (bytes = 32_000, token: string | null = 'good', headers: Record<string, string> = {}) =>
  new Request('https://fn.test/talk-stt', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/m4a', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: new Uint8Array(bytes),
  });

const errorOf = async (res: Response) => ((await res.json()) as { error: { kind: string; message: string } }).error;

it('unauthenticated → 401, nothing spent', async () => {
  const { handler, store, provider, consumeQuota } = setup();
  expect((await handler(audioReq(32_000, null))).status).toBe(401);
  expect(consumeQuota).not.toHaveBeenCalled();
  expect(store.reservations).toHaveLength(0);
  expect(provider.calls).toHaveLength(0);
});

it('an oversized upload is refused by Content-Length before buffering, quota or budget', async () => {
  const { handler, consumeQuota, provider } = setup();
  const res = await handler(audioReq(10, 'good', { 'Content-Length': String(16 * 1024 * 1024) }));
  expect(res.status).toBe(413);
  expect(consumeQuota).not.toHaveBeenCalled();
  expect(provider.calls).toHaveLength(0);
});

it('daily limit reached → the same 429 as before; no reservation, no provider call', async () => {
  const { handler, store, provider } = setup({ quota: { allowed: false } });
  const res = await handler(audioReq());
  expect(res.status).toBe(429);
  expect(await errorOf(res)).toEqual({ kind: 'daily_limit_reached', message: "You've reached today's audio limit — come back tomorrow!" });
  expect(store.reservations).toHaveLength(0);
  expect(provider.calls).toHaveLength(0);
});

it('monthly budget exhausted → budget_exhausted; no provider call', async () => {
  const { handler, provider } = setup({ store: createFakeBudgetStore({ spentUsd: 10 }) });
  const res = await handler(audioReq());
  expect(res.status).toBe(503);
  expect((await errorOf(res)).kind).toBe('budget_exhausted');
  expect(provider.calls).toHaveLength(0);
});

it('reserves a conservative bound from the file size, then logs the real duration in seconds', async () => {
  const { handler, store, provider } = setup();
  const res = await handler(audioReq(32_000));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ text: 'عسلامة' });

  const reservedSeconds = budget.sttUpperBoundSeconds(32_000);
  expect(store.reservations[0]).toMatchObject({
    callType: 'stt',
    model: 'whisper-1',
    accountId: ACCOUNT,
    amountUsd: expect.closeTo((reservedSeconds / 60) * 0.006, 10),
    status: 'reconciled',
  });
  expect(store.usage[0]).toMatchObject({
    callType: 'stt',
    model: 'whisper-1',
    units: { audioSeconds: 4.2 },
    costUsd: expect.closeTo((4.2 / 60) * 0.006, 10),
    usageEstimated: false,
  });
  // whisper reports the duration only in verbose_json.
  const form = provider.callsTo('/audio/transcriptions')[0].init.body as FormData;
  expect(form.get('response_format')).toBe('verbose_json');
  expect(form.get('model')).toBe('whisper-1');
});

it('a model that reports no duration is logged at the reserved upper bound, flagged as estimated', async () => {
  const { handler, store, provider } = setup({
    env: { AI_STT_MODEL: 'gpt-4o-transcribe', AI_PRICE_STT_PER_MINUTE: '0.006' },
    transcribe: () => json({ text: 'aslema' }),
  });
  expect((await handler(audioReq(20_000))).status).toBe(200);

  const form = provider.callsTo('/audio/transcriptions')[0].init.body as FormData;
  expect(form.get('response_format')).toBe('json');
  expect(store.usage[0]).toMatchObject({ model: 'gpt-4o-transcribe', usageEstimated: true, costUsd: store.reservations[0].amountUsd });
});

it('provider error → released; timeout → ambiguous', async () => {
  const a = setup({ transcribe: () => new Response('bad audio', { status: 400 }) });
  expect((await a.handler(audioReq())).status).toBe(502);
  expect(a.store.reservations[0].status).toBe('released');

  const b = setup({ transcribe: hang });
  expect((await b.handler(audioReq())).status).toBe(504);
  expect(b.store.reservations[0].status).toBe('ambiguous');
});

it('a usage-logging failure is reported, not returned as a successful transcription', async () => {
  const { handler } = setup({ store: createFakeBudgetStore({ fail: { reconcile: true } }) });
  const res = await handler(audioReq());
  expect(res.status).toBe(500);
  expect((await errorOf(res)).kind).toBe('accounting_failed');
});
