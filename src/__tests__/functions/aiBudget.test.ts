/**
 * @jest-environment node
 */
// supabase/functions/_shared/aiBudget.ts: price configuration, cost
// estimates per unit (tokens / characters / audio seconds), and
// meteredCall — reserve before the provider call, then reconcile, release
// or keep (ambiguous). The SQL side is tested in supabase/tests/.
import { createFakeBudgetStore } from '@/test-utils/fakeAiBudgetStore';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const budget = require('../../../supabase/functions/_shared/aiBudget.ts');

const envOf = (vars: Record<string, string>) => (name: string) => vars[name];

describe('monthly budget setting', () => {
  it('defaults to 10 USD', () => {
    expect(budget.monthlyBudgetUsd(envOf({}))).toEqual({ ok: true, value: 10 });
  });

  it('reads AI_MONTHLY_BUDGET_USD', () => {
    expect(budget.monthlyBudgetUsd(envOf({ AI_MONTHLY_BUDGET_USD: '25.5' }))).toEqual({ ok: true, value: 25.5 });
    expect(budget.monthlyBudgetUsd(envOf({ AI_MONTHLY_BUDGET_USD: '0' }))).toEqual({ ok: true, value: 0 });
  });

  it.each(['abc', '-1', 'Infinity', ' '])('an invalid value (%p) fails closed instead of guessing', (value) => {
    expect(budget.monthlyBudgetUsd(envOf({ AI_MONTHLY_BUDGET_USD: value })).ok).toBe(false);
  });
});

describe('prices', () => {
  it('has defaults for the models this project uses', () => {
    expect(budget.chatPricing(envOf({}), 'gpt-4o-mini')).toEqual({
      ok: true,
      value: { model: 'gpt-4o-mini', inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
    });
    expect(budget.embeddingPricing(envOf({}), 'text-embedding-3-small')).toEqual({
      ok: true,
      value: { model: 'text-embedding-3-small', per1MTokens: 0.02 },
    });
    expect(budget.ttsPricing(envOf({}), 'tts-1')).toEqual({ ok: true, value: { model: 'tts-1', per1MCharacters: 15 } });
    expect(budget.sttPricing(envOf({}), 'whisper-1')).toEqual({ ok: true, value: { model: 'whisper-1', perMinute: 0.006 } });
  });

  it('env variables override the defaults', () => {
    const env = envOf({
      AI_PRICE_CHAT_INPUT_PER_1M_TOKENS: '1',
      AI_PRICE_CHAT_OUTPUT_PER_1M_TOKENS: '2',
      AI_PRICE_EMBEDDING_PER_1M_TOKENS: '0.1',
      AI_PRICE_TTS_PER_1M_CHARACTERS: '30',
      AI_PRICE_STT_PER_MINUTE: '0.01',
    });
    expect(budget.chatPricing(env, 'gpt-4o-mini').value).toMatchObject({ inputPer1MTokens: 1, outputPer1MTokens: 2 });
    expect(budget.embeddingPricing(env, 'text-embedding-3-small').value).toMatchObject({ per1MTokens: 0.1 });
    expect(budget.ttsPricing(env, 'tts-1').value).toMatchObject({ per1MCharacters: 30 });
    expect(budget.sttPricing(env, 'whisper-1').value).toMatchObject({ perMinute: 0.01 });
  });

  it('a model without a default price needs an explicit price — otherwise it fails closed', () => {
    expect(budget.chatPricing(envOf({}), 'gpt-9-ultra').ok).toBe(false);
    expect(budget.ttsPricing(envOf({}), 'tts-hd-2').ok).toBe(false);
    const env = envOf({ AI_PRICE_CHAT_INPUT_PER_1M_TOKENS: '3', AI_PRICE_CHAT_OUTPUT_PER_1M_TOKENS: '9' });
    expect(budget.chatPricing(env, 'gpt-9-ultra')).toEqual({
      ok: true,
      value: { model: 'gpt-9-ultra', inputPer1MTokens: 3, outputPer1MTokens: 9 },
    });
  });

  it('an invalid price fails closed', () => {
    expect(budget.sttPricing(envOf({ AI_PRICE_STT_PER_MINUTE: 'cheap' }), 'whisper-1').ok).toBe(false);
    expect(budget.embeddingPricing(envOf({ AI_PRICE_EMBEDDING_PER_1M_TOKENS: '-0.02' }), 'text-embedding-3-small').ok).toBe(false);
  });
});

describe('cost estimates by unit', () => {
  const chat = { model: 'gpt-4o-mini', inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 };

  it('chat: actual cost from prompt and completion tokens', () => {
    expect(budget.chatCostUsd(chat, 1_000_000, 1_000_000)).toBeCloseTo(0.75, 10);
    expect(budget.chatCostUsd(chat, 2000, 300)).toBeCloseTo(0.00048, 10);
  });

  it('chat: the upper bound counts every UTF-8 byte as a token, plus overhead, plus the max output', () => {
    const messages = [{ content: 'مرحبا' }, { content: 'hello' }]; // 10 + 5 bytes
    const upper = budget.chatUpperBound(chat, messages, 400);
    expect(upper.inputTokens).toBeGreaterThanOrEqual(15);
    expect(upper.outputTokens).toBe(400);
    expect(upper.usd).toBeGreaterThanOrEqual(budget.chatCostUsd(chat, 15, 400));
  });

  it('embedding: tokens', () => {
    const p = { model: 'text-embedding-3-small', per1MTokens: 0.02 };
    expect(budget.embeddingCostUsd(p, 500_000)).toBeCloseTo(0.01, 10);
    expect(budget.embeddingUpperBound(p, 'abc').tokens).toBeGreaterThanOrEqual(3);
  });

  it('tts: input characters', () => {
    const p = { model: 'tts-1', per1MCharacters: 15 };
    expect(budget.ttsCostUsd(p, 1000)).toBeCloseTo(0.015, 10);
    expect(budget.ttsCharacters('aslema')).toBe(6);
  });

  it('stt: audio seconds, with a conservative upper bound from the file size', () => {
    const p = { model: 'whisper-1', perMinute: 0.006 };
    expect(budget.sttCostUsd(p, 60)).toBeCloseTo(0.006, 10);
    expect(budget.sttCostUsd(p, 5)).toBeCloseTo(0.0005, 10);
    // A 20 s voice note at 64 kbps is ~160 KB; the bound must not undercount it.
    expect(budget.sttUpperBoundSeconds(160_000)).toBeGreaterThanOrEqual(20);
    expect(budget.sttUpperBoundSeconds(1)).toBeGreaterThanOrEqual(1);
  });

  it('rounds costs up, never down, to the stored precision', () => {
    expect(budget.roundUpUsd(0.0000000001)).toBe(0.00000001);
    expect(budget.roundUpUsd(1)).toBe(1);
  });
});

describe('meteredCall', () => {
  const base = (store: ReturnType<typeof createFakeBudgetStore>, overrides: Record<string, unknown> = {}) => ({
    store,
    accountId: 'acc-1',
    profileId: 'p1',
    callType: 'chat',
    model: 'gpt-4o-mini',
    budgetUsd: 10,
    reserveUsd: 0.5,
    pricing: { model: 'gpt-4o-mini' },
    costOf: (units: { promptTokens: number }) => units.promptTokens / 1000,
    log: jest.fn(),
    ...overrides,
  });

  it('reserves first, then calls, then reconciles at the actual cost with the usage units', async () => {
    const store = createFakeBudgetStore();
    const call = jest.fn(async () => {
      expect(store.reservations).toHaveLength(1); // reserved before the provider is called
      return { kind: 'billed', value: 'reply', units: { promptTokens: 120, completionTokens: 30 } };
    });
    const result = await budget.meteredCall({ ...base(store), call });

    expect(result).toEqual({ ok: true, value: 'reply' });
    expect(store.reservations[0]).toMatchObject({ accountId: 'acc-1', callType: 'chat', model: 'gpt-4o-mini', amountUsd: 0.5, status: 'reconciled' });
    expect(store.usage[0]).toMatchObject({ profileId: 'p1', costUsd: 0.12, usageEstimated: false, units: { promptTokens: 120, completionTokens: 30 } });
  });

  it('when the provider reports no usage, records the reserved upper bound and flags it as estimated', async () => {
    const store = createFakeBudgetStore();
    await budget.meteredCall({ ...base(store), call: async () => ({ kind: 'billed', value: 'x', units: null }) });
    expect(store.usage[0]).toMatchObject({ costUsd: 0.5, usageEstimated: true });
  });

  it('budget exhausted: the provider is never called', async () => {
    const store = createFakeBudgetStore({ spentUsd: 9.8 });
    const call = jest.fn();
    const result = await budget.meteredCall({ ...base(store), call });

    expect(call).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: { kind: 'budget_exhausted', message: 'Talk to a Tunisian is temporarily unavailable. Please try again later.', status: 503 },
    });
    expect(store.reservations).toHaveLength(0);
  });

  it('a failed reservation fails closed: no provider call', async () => {
    const store = createFakeBudgetStore({ fail: { reserve: true } });
    const call = jest.fn();
    const result = await budget.meteredCall({ ...base(store), call });

    expect(call).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ kind: 'budget_check_failed', status: 503 });
  });

  it('a provider error status: nothing was billed, so the reservation is released', async () => {
    const store = createFakeBudgetStore();
    const providerError = { kind: 'provider_error', message: 'AI provider returned 500', status: 502 };
    const result = await budget.meteredCall({ ...base(store), call: async () => ({ kind: 'not_billed', error: providerError }) });

    expect(result).toEqual({ ok: false, error: providerError });
    expect(store.reservations[0].status).toBe('released');
    expect(store.usage).toHaveLength(0);
  });

  it('a timeout is ambiguous: the reservation stays counted (not released)', async () => {
    const store = createFakeBudgetStore();
    const timeout = { kind: 'timeout', message: 'Timed out waiting for the AI provider', status: 504 };
    const result = await budget.meteredCall({ ...base(store), call: async () => ({ kind: 'ambiguous', error: timeout, reason: 'timeout' }) });

    expect(result).toEqual({ ok: false, error: timeout });
    expect(store.reservations[0]).toMatchObject({ status: 'ambiguous', note: 'timeout' });
  });

  it('a call that throws unexpectedly is treated as ambiguous, never released', async () => {
    const store = createFakeBudgetStore();
    const result = await budget.meteredCall({
      ...base(store),
      call: async () => {
        throw new Error('boom');
      },
    });

    expect(result.ok).toBe(false);
    expect(store.reservations[0].status).toBe('ambiguous');
  });

  it('retrying after an ambiguous call can’t exceed the cap: the earlier reservation still counts', async () => {
    const store = createFakeBudgetStore();
    const ambiguous = async () => ({ kind: 'ambiguous', error: { kind: 'timeout', message: 't', status: 504 }, reason: 'timeout' });
    for (let i = 0; i < 25; i++) {
      await budget.meteredCall({ ...base(store), call: ambiguous });
    }
    expect(store.reservations.filter((r) => r.status === 'ambiguous')).toHaveLength(20); // 20 × 0.5 = 10
    const call = jest.fn();
    expect((await budget.meteredCall({ ...base(store), call })).error.kind).toBe('budget_exhausted');
    expect(call).not.toHaveBeenCalled();
  });

  it('a failed reconcile is reported as accounting_failed, not as success — and the reservation stays counted', async () => {
    const store = createFakeBudgetStore({ fail: { reconcile: true } });
    const log = jest.fn();
    const result = await budget.meteredCall({ ...base(store, { log }), call: async () => ({ kind: 'billed', value: 'reply', units: { promptTokens: 1 } }) });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'accounting_failed', message: expect.any(String), status: 500 },
    });
    expect(store.reservations[0].status).toBe('reserved');
    expect(log).toHaveBeenCalled();
  });

  it('a failed release is logged; the provider error is still returned and the reservation stays counted', async () => {
    const store = createFakeBudgetStore({ fail: { release: true } });
    const log = jest.fn();
    const providerError = { kind: 'rate_limited', message: 'slow down', status: 429 };
    const result = await budget.meteredCall({ ...base(store, { log }), call: async () => ({ kind: 'not_billed', error: providerError }) });

    expect(result).toEqual({ ok: false, error: providerError });
    expect(store.reservations[0].status).toBe('reserved');
    expect(log).toHaveBeenCalled();
  });
});

describe('provider fetch outcomes', () => {
  const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('a provider error status is not billed; 429 keeps its rate_limited kind', async () => {
    const r500 = await budget.providerFetch(async () => new Response('down', { status: 500 }), 'https://ai.test/x', {}, 1000);
    expect(r500).toMatchObject({ kind: 'not_billed', error: { kind: 'provider_error', status: 502 } });
    const r429 = await budget.providerFetch(async () => new Response('slow', { status: 429 }), 'https://ai.test/x', {}, 1000);
    expect(r429).toMatchObject({ kind: 'not_billed', error: { kind: 'rate_limited', status: 429 } });
  });

  it('a network failure or timeout is ambiguous', async () => {
    const net = await budget.providerFetch(
      async () => {
        throw new TypeError('fetch failed');
      },
      'https://ai.test/x',
      {},
      1000
    );
    expect(net).toMatchObject({ kind: 'ambiguous', error: { kind: 'network', status: 502 } });

    const slow = await budget.providerFetch(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      'https://ai.test/x',
      {},
      10
    );
    expect(slow).toMatchObject({ kind: 'ambiguous', error: { kind: 'timeout', status: 504 } });
  });

  it('a 2xx response is handed back to read', async () => {
    const r = await budget.providerFetch(async () => okJson({ a: 1 }), 'https://ai.test/x', {}, 1000);
    expect(r.kind).toBe('response');
    expect(await r.response.json()).toEqual({ a: 1 });
  });
});
