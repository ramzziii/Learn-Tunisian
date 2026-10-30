/**
 * @jest-environment node
 */
// talk-to-a-tunisian, run for real with fakes. One turn can make two paid
// calls — the retrieval embedding and the chat completion — and each is
// reserved against the monthly budget first and logged with its own model
// and tokens. Authorization (JWT + own profile) and the per-account daily
// quota still come before either.
import { createFakeBudgetStore } from '@/test-utils/fakeAiBudgetStore';
import { chatOk, embeddingOk, fakeProvider, hang, json } from '@/test-utils/fakeAiProvider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createChatHandler } = require('../../../supabase/functions/talk-to-a-tunisian/handler.ts');

const ACCOUNT = 'acc-1';
const PROFILE = 'p-own';
const RAW = JSON.stringify({ tunisian: 'aslema', english: 'hello', transliteration: 'aslema' });

type Route = (init: RequestInit) => Response | Promise<Response>;

function setup(
  opts: {
    env?: Record<string, string>;
    quota?: unknown;
    store?: ReturnType<typeof createFakeBudgetStore>;
    embeddings?: Route;
    chat?: Route;
    matches?: string[];
  } = {}
) {
  const store = opts.store ?? createFakeBudgetStore();
  const provider = fakeProvider({
    '/embeddings': opts.embeddings ?? embeddingOk(7),
    '/chat/completions': opts.chat ?? chatOk(RAW),
  });
  const consumeQuota = jest.fn(async () => opts.quota ?? { allowed: true });
  const ownsProfile = jest.fn(async (_token: string, profileId: string) => profileId === PROFILE);
  const logCorrection = jest.fn(async () => {});
  const env = { AI_API_KEY: 'test-key', ...opts.env };
  const handler = createChatHandler({
    env: (name: string) => (env as Record<string, string>)[name],
    getUserId: async (token: string) => (token === 'good' ? ACCOUNT : null),
    ownsProfile,
    consumeQuota,
    matchVerifiedContent: async () => opts.matches ?? ['aslema — hello'],
    logCorrection,
    store,
    fetch: provider.fetch,
    timeoutMs: 50,
    log: jest.fn(),
  });
  return { handler, store, provider, consumeQuota, ownsProfile, logCorrection };
}

const turn = (extra: Record<string, unknown> = {}, token: string | null = 'good') =>
  new Request('https://fn.test/talk-to-a-tunisian', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      systemPrompt: 'You are a friendly Tunisian tutor.',
      history: [{ role: 'tutor', text: 'Aslema!' }],
      learnerMessage: 'labes',
      profileId: PROFILE,
      retrievalQuery: 'labes',
      ...extra,
    }),
  });

const errorOf = async (res: Response) => ((await res.json()) as { error: { kind: string; message: string } }).error;

describe('authorization and the daily quota come first', () => {
  it('unauthenticated → 401, nothing spent', async () => {
    const { handler, store, provider, consumeQuota } = setup();
    const res = await handler(turn({}, null));
    expect(res.status).toBe(401);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(store.reservations).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('someone else’s profile → 403, nothing spent', async () => {
    const { handler, store, provider, consumeQuota } = setup();
    const res = await handler(turn({ profileId: 'p-not-mine' }));
    expect(res.status).toBe(403);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(store.reservations).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('daily limit reached → the same 429 as before; no reservation, no provider call', async () => {
    const { handler, store, provider } = setup({ quota: { allowed: false } });
    const res = await handler(turn());
    expect(res.status).toBe(429);
    expect(await errorOf(res)).toEqual({
      kind: 'daily_limit_reached',
      message: "You've reached today's conversation limit — come back tomorrow!",
    });
    expect(store.reservations).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('an oversized prompt field → 413 before quota or budget', async () => {
    const { handler, consumeQuota, provider } = setup();
    expect((await handler(turn({ learnerMessage: 'x'.repeat(5000) }))).status).toBe(413);
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
  });
});

describe('a normal turn', () => {
  it('embeds, retrieves, chats — and logs both paid calls with their own model and tokens', async () => {
    const { handler, store, provider, logCorrection } = setup();
    const res = await handler(turn());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ raw: RAW });

    // Retrieval was grounded in the verified match.
    const chatBody = JSON.parse(String(provider.callsTo('/chat/completions')[0].init.body));
    expect(chatBody.messages[0].content).toContain('aslema — hello');
    expect(chatBody.max_tokens).toBe(400);

    expect(store.usage).toEqual([
      expect.objectContaining({
        callType: 'embedding',
        model: 'text-embedding-3-small',
        accountId: ACCOUNT,
        profileId: PROFILE,
        units: { promptTokens: 7, totalTokens: 7 },
        costUsd: expect.closeTo((7 * 0.02) / 1e6, 12),
        usageEstimated: false,
      }),
      expect.objectContaining({
        callType: 'chat',
        model: 'gpt-4o-mini',
        accountId: ACCOUNT,
        profileId: PROFILE,
        units: { promptTokens: 900, completionTokens: 120, totalTokens: 1020 },
        costUsd: expect.closeTo((900 * 0.15 + 120 * 0.6) / 1e6, 12),
        usageEstimated: false,
      }),
    ]);
    // Each was reserved at an upper bound at least as large as what it cost.
    for (const row of store.usage) {
      const res = store.reservations.find((r) => r.id === row.reservationId)!;
      expect(res.amountUsd).toBeGreaterThanOrEqual(row.costUsd);
      expect(res.status).toBe('reconciled');
    }
    expect(logCorrection).toHaveBeenCalledWith('good', PROFILE, expect.stringContaining('aslema'));
  });

  it('usage is attributed to the token’s account, whatever the body claims', async () => {
    const { handler, store } = setup();
    await handler(turn({ accountId: 'acc-other', userId: 'acc-other' }));
    expect(store.usage.every((u) => u.accountId === ACCOUNT)).toBe(true);
  });

  it('no usage reported for the chat call → logged at its reserved bound, flagged estimated', async () => {
    const { handler, store } = setup({ chat: chatOk(RAW, null) });
    await handler(turn());
    const chat = store.usage.find((u) => u.callType === 'chat')!;
    const reservation = store.reservations.find((r) => r.id === chat.reservationId)!;
    expect(chat).toMatchObject({ usageEstimated: true, costUsd: reservation.amountUsd });
  });

  it('billed but with no message content → 502, and the spend is still logged', async () => {
    const { handler, store } = setup({ chat: () => json({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 } }) });
    const res = await handler(turn());
    expect(res.status).toBe(502);
    expect(store.usage.map((u) => u.callType)).toEqual(['embedding', 'chat']);
  });
});

describe('the monthly budget', () => {
  it('exhausted → 503 budget_exhausted, and neither paid call happens', async () => {
    const { handler, provider } = setup({ store: createFakeBudgetStore({ spentUsd: 10 }) });
    const res = await handler(turn());
    expect(res.status).toBe(503);
    expect(await errorOf(res)).toEqual({
      kind: 'budget_exhausted',
      message: 'Talk to a Tunisian is temporarily unavailable. Please try again later.',
    });
    expect(provider.calls).toHaveLength(0);
  });

  it('room for the embedding but not the chat call → budget_exhausted after the embedding is logged; chat never called', async () => {
    // A tiny budget: the embedding's bound fits, the chat call's (400 output tokens) doesn't.
    const { handler, store, provider } = setup({ env: { AI_MONTHLY_BUDGET_USD: '0.0001' } });
    const res = await handler(turn());
    expect(res.status).toBe(503);
    expect((await errorOf(res)).kind).toBe('budget_exhausted');
    expect(provider.callsTo('/embeddings')).toHaveLength(1);
    expect(provider.callsTo('/chat/completions')).toHaveLength(0);
    expect(store.usage.map((u) => u.callType)).toEqual(['embedding']);
  });

  it('the reservation failing fails closed: no paid call at all', async () => {
    const { handler, provider } = setup({ store: createFakeBudgetStore({ fail: { reserve: true } }) });
    const res = await handler(turn());
    expect(res.status).toBe(503);
    expect((await errorOf(res)).kind).toBe('budget_check_failed');
    expect(provider.calls).toHaveLength(0);
  });

  it('a model with no known price fails closed before the quota is spent', async () => {
    const { handler, consumeQuota, provider } = setup({ env: { AI_MODEL: 'gpt-unknown' } });
    const res = await handler(turn());
    expect(res.status).toBe(500);
    expect((await errorOf(res)).kind).toBe('not_configured');
    expect(consumeQuota).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
  });
});

describe('failed and ambiguous provider calls', () => {
  it('embedding error → released, and the turn continues without retrieval (as before)', async () => {
    const { handler, store, provider } = setup({ embeddings: () => new Response('down', { status: 500 }) });
    const res = await handler(turn());
    expect(res.status).toBe(200);
    expect(store.reservations.find((r) => r.callType === 'embedding')!.status).toBe('released');
    const chatBody = JSON.parse(String(provider.callsTo('/chat/completions')[0].init.body));
    expect(chatBody.messages[0].content).not.toContain('Verified Tunisian examples');
  });

  it('embedding timeout → kept as ambiguous; the turn still continues', async () => {
    const { handler, store } = setup({ embeddings: hang });
    const res = await handler(turn());
    expect(res.status).toBe(200);
    expect(store.reservations.find((r) => r.callType === 'embedding')!.status).toBe('ambiguous');
  });

  it('chat provider error → 502, chat reservation released', async () => {
    const { handler, store } = setup({ chat: () => new Response('down', { status: 503 }) });
    const res = await handler(turn());
    expect(res.status).toBe(502);
    expect(store.reservations.find((r) => r.callType === 'chat')!.status).toBe('released');
  });

  it('chat rate-limited by the provider → the same rate_limited 429 as before, released', async () => {
    const { handler, store } = setup({ chat: () => new Response('slow down', { status: 429 }) });
    const res = await handler(turn());
    expect(res.status).toBe(429);
    expect((await errorOf(res)).kind).toBe('rate_limited');
    expect(store.reservations.find((r) => r.callType === 'chat')!.status).toBe('released');
  });

  it('chat timeout → 504, kept as ambiguous', async () => {
    const { handler, store } = setup({ chat: hang });
    const res = await handler(turn());
    expect(res.status).toBe(504);
    expect(store.reservations.find((r) => r.callType === 'chat')!.status).toBe('ambiguous');
  });

  it('logging the embedding fails → accounting_failed, and the chat call is not made', async () => {
    const { handler, provider } = setup({ store: createFakeBudgetStore({ fail: { reconcile: true } }) });
    const res = await handler(turn());
    expect(res.status).toBe(500);
    expect((await errorOf(res)).kind).toBe('accounting_failed');
    expect(provider.callsTo('/chat/completions')).toHaveLength(0);
  });
});
