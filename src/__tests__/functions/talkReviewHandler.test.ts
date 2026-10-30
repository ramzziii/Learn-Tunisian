/**
 * @jest-environment node
 */
// talk-review promotes AI-generated Tunisian Arabic into the verified corpus
// the tutor treats as the source of truth. Only an explicitly allowlisted
// language reviewer (public.reviewers) may do that — not just any admin.
// These run the real handler (supabase/functions/talk-review/handler.ts)
// with fake dependencies, so the order of checks and what does or doesn't
// happen for each caller is exercised, not just read from the source.
import { createFakeBudgetStore } from '@/test-utils/fakeAiBudgetStore';
import { embeddingOk, fakeProvider, hang } from '@/test-utils/fakeAiProvider';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createReviewHandler } = require('../../../supabase/functions/talk-review/handler.ts');

const REVIEWER = 'reviewer-user-id';
const OTHER = 'other-user-id';

type Overrides = Record<string, unknown> & {
  store?: ReturnType<typeof createFakeBudgetStore>;
  embeddings?: (init: RequestInit) => Response | Promise<Response>;
  envVars?: Record<string, string>;
};

function makeDeps(overrides: Overrides = {}) {
  const { store: storeOverride, embeddings, envVars, ...rest } = overrides;
  const store = storeOverride ?? createFakeBudgetStore();
  const provider = fakeProvider({ '/embeddings': embeddings ?? embeddingOk(9) });
  const env: Record<string, string> = { AI_API_KEY: 'test-ai-key', AI_BASE_URL: 'https://ai.test/v1', ...envVars };
  const calls = {
    embed: {
      get mock() {
        return { calls: provider.callsTo('/embeddings') };
      },
    },
    claim: jest.fn(),
    release: jest.fn(),
    insert: jest.fn(),
    isReviewer: jest.fn(),
  };
  const deps = {
    env: (name: string) => env[name],
    fetch: provider.fetch,
    store,
    timeoutMs: 50,
    log: jest.fn(),
    getUserId: async (token: string) => (token === 'reviewer-token' ? REVIEWER : token === 'other-token' ? OTHER : null),
    isReviewer: async (userId: string) => {
      calls.isReviewer(userId);
      return userId === REVIEWER;
    },
    getCorrection: async (id: string) => (id === 'c-pending' ? { id, isPending: true } : id === 'c-done' ? { id, isPending: false } : null),
    claimCorrection: async (id: string, patch: Record<string, unknown>) => {
      calls.claim(id, patch);
      return true;
    },
    releaseCorrection: async (id: string) => {
      calls.release(id);
    },
    insertVerified: async (table: string, row: Record<string, unknown>) => {
      calls.insert(table, row);
      return null;
    },
    ...rest,
  };
  return { deps, calls, store, provider };
}

const body = (extra: Record<string, unknown> = {}) => ({
  correctionId: 'c-pending',
  action: 'approve',
  targetTable: 'phrase',
  tunisianText: 'aslema',
  englishText: 'hello',
  transliteration: 'aslema',
  reviewerName: 'Native reviewer',
  ...extra,
});

const post = (payload: unknown, token?: string) =>
  new Request('https://fn.test/talk-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });

const json = async (res: Response) => (await res.json()) as { ok?: boolean; error?: { kind: string; message: string } };

function expectNoPromotion(calls: ReturnType<typeof makeDeps>['calls']) {
  expect(calls.embed.mock.calls).toHaveLength(0);
  expect(calls.claim).not.toHaveBeenCalled();
  expect(calls.insert).not.toHaveBeenCalled();
}

describe('unauthenticated callers', () => {
  it('no Authorization header → 401, nothing promoted, reviewer table never consulted', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body()));

    expect(res.status).toBe(401);
    expect((await json(res)).error?.kind).toBe('unauthenticated');
    expect(calls.isReviewer).not.toHaveBeenCalled();
    expectNoPromotion(calls);
  });

  it('an invalid or expired token → 401', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body(), 'garbage-token'));

    expect(res.status).toBe(401);
    expectNoPromotion(calls);
  });

  it('a non-Bearer Authorization header → 401', async () => {
    const { deps, calls } = makeDeps();
    const req = new Request('https://fn.test/talk-review', {
      method: 'POST',
      headers: { Authorization: 'Basic reviewer-token' },
      body: JSON.stringify(body()),
    });
    const res = await createReviewHandler(deps)(req);

    expect(res.status).toBe(401);
    expectNoPromotion(calls);
  });
});

describe('signed-in callers who are not reviewers', () => {
  it('→ 403, nothing embedded, claimed or inserted', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body(), 'other-token'));

    expect(res.status).toBe(403);
    expect((await json(res)).error?.kind).toBe('forbidden');
    expect(calls.isReviewer).toHaveBeenCalledWith(OTHER);
    expectNoPromotion(calls);
  });

  it('client-supplied identity or reviewer flags are ignored — only the token’s user is checked', async () => {
    const { deps, calls } = makeDeps();
    const spoofed = body({ userId: REVIEWER, user_id: REVIEWER, email: 'reviewer@example.com', isReviewer: true, profileId: 'p1' });
    const res = await createReviewHandler(deps)(post(spoofed, 'other-token'));

    expect(res.status).toBe(403);
    expect(calls.isReviewer).toHaveBeenCalledTimes(1);
    expect(calls.isReviewer).toHaveBeenCalledWith(OTHER);
    expectNoPromotion(calls);
  });

  it('a failed reviewer lookup fails closed (no promotion), with a retryable error', async () => {
    const { deps, calls } = makeDeps({
      isReviewer: async () => {
        throw new Error('db down');
      },
    });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(503);
    expect((await json(res)).error?.kind).toBe('reviewer_check_failed');
    expectNoPromotion(calls);
  });
});

describe('approved reviewers', () => {
  it('approve: embeds, claims the pending correction, inserts it as native-verified → 200', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(JSON.parse(String(calls.embed.mock.calls[0].init.body)).input).toBe('aslema hello aslema');
    expect(calls.claim).toHaveBeenCalledWith(
      'c-pending',
      expect.objectContaining({ is_correct: true, corrected_text: null, reviewer_name: 'Native reviewer', correction_reason: null })
    );
    expect(calls.insert).toHaveBeenCalledWith(
      'phrases',
      expect.objectContaining({ tunisian_text: 'aslema', english_text: 'hello', native_verified: true, native_reviewer: 'Native reviewer', embedding: [0.1, 0.2, 0.3] })
    );
    // Claimed before inserting, so two reviewers can't promote the same row twice.
    expect(calls.claim.mock.invocationCallOrder[0]).toBeLessThan(calls.insert.mock.invocationCallOrder[0]);
  });

  it('reject-with-correction: promotes the corrected text into sentences and logs the reason', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(
      post(body({ action: 'reject', targetTable: 'sentence', tunisianText: 'chnowa ahwelek', correctionReason: 'too_formal' }), 'reviewer-token')
    );

    expect(res.status).toBe(200);
    const patch = calls.claim.mock.calls[0][1];
    expect(patch).toMatchObject({ is_correct: false, correction_reason: 'too_formal' });
    expect(JSON.parse(patch.corrected_text)).toEqual({ tunisian: 'chnowa ahwelek', english: 'hello', transliteration: 'aslema' });
    expect(calls.insert).toHaveBeenCalledWith('sentences', expect.objectContaining({ tunisian_text: 'chnowa ahwelek' }));
  });

  it('a correction that doesn’t exist → 404, nothing promoted', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body({ correctionId: 'c-missing' }), 'reviewer-token'));

    expect(res.status).toBe(404);
    expectNoPromotion(calls);
  });

  it('an already-reviewed correction → 409, nothing promoted again', async () => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body({ correctionId: 'c-done' }), 'reviewer-token'));

    expect(res.status).toBe(409);
    expectNoPromotion(calls);
  });

  it('losing the claim race to another reviewer → 409, no insert', async () => {
    const { deps, calls } = makeDeps({ claimCorrection: async () => false });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(409);
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it('if saving the verified row fails, the claim is released and the error is reported', async () => {
    const { deps, calls } = makeDeps({ insertVerified: async () => 'insert failed' });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(500);
    expect(calls.release).toHaveBeenCalledWith('c-pending');
  });

  it.each([
    ['an unknown action', { action: 'delete' }],
    ['an unknown target table', { targetTable: 'profiles' }],
    ['missing text', { tunisianText: '' }],
    ['a missing reviewer name', { reviewerName: '' }],
  ])('%s → 400, nothing promoted', async (_label, extra) => {
    const { deps, calls } = makeDeps();
    const res = await createReviewHandler(deps)(post(body(extra), 'reviewer-token'));

    expect(res.status).toBe(400);
    expectNoPromotion(calls);
  });

  it('a malformed body → 400', async () => {
    const { deps, calls } = makeDeps();
    const req = new Request('https://fn.test/talk-review', {
      method: 'POST',
      headers: { Authorization: 'Bearer reviewer-token' },
      body: '{not json',
    });
    const res = await createReviewHandler(deps)(req);

    expect(res.status).toBe(400);
    expectNoPromotion(calls);
  });
});

it('CORS preflight is answered without auth; other methods → 405', async () => {
  const { deps } = makeDeps();
  const handler = createReviewHandler(deps);

  expect((await handler(new Request('https://fn.test/talk-review', { method: 'OPTIONS' }))).status).toBe(200);
  expect((await handler(new Request('https://fn.test/talk-review', { method: 'GET' }))).status).toBe(405);
});

describe('the paid embedding is under the monthly budget', () => {
  it('is reserved, then logged with its model and tokens for the reviewer’s account', async () => {
    const { deps, store } = makeDeps();
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(200);
    expect(store.usage).toEqual([
      expect.objectContaining({
        accountId: REVIEWER,
        profileId: null,
        callType: 'embedding',
        model: 'text-embedding-3-small',
        units: { promptTokens: 9, totalTokens: 9 },
        usageEstimated: false,
      }),
    ]);
  });

  it('budget exhausted → 503 budget_exhausted; no embedding, nothing claimed or inserted', async () => {
    const { deps, calls } = makeDeps({ store: createFakeBudgetStore({ spentUsd: 10 }) });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(503);
    expect((await json(res)).error?.kind).toBe('budget_exhausted');
    expectNoPromotion(calls);
  });

  it('the reservation failing fails closed — no embedding', async () => {
    const { deps, calls } = makeDeps({ store: createFakeBudgetStore({ fail: { reserve: true } }) });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(503);
    expectNoPromotion(calls);
  });

  it('provider error → released, nothing claimed', async () => {
    const { deps, calls, store } = makeDeps({ embeddings: () => new Response('down', { status: 500 }) });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(502);
    expect(store.reservations[0].status).toBe('released');
    expect(calls.claim).not.toHaveBeenCalled();
  });

  it('timeout → kept as ambiguous, nothing claimed', async () => {
    const { deps, calls, store } = makeDeps({ embeddings: hang });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(504);
    expect(store.reservations[0].status).toBe('ambiguous');
    expect(calls.claim).not.toHaveBeenCalled();
  });

  it('logging the embedding fails → accounting_failed, nothing claimed or inserted', async () => {
    const { deps, calls } = makeDeps({ store: createFakeBudgetStore({ fail: { reconcile: true } }) });
    const res = await createReviewHandler(deps)(post(body(), 'reviewer-token'));

    expect(res.status).toBe(500);
    expect((await json(res)).error?.kind).toBe('accounting_failed');
    expect(calls.claim).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
  });
});
