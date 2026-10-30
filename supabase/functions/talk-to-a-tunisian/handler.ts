// talk-to-a-tunisian request handling — no Deno/npm imports, so it runs
// under Jest (src/__tests__/functions/talkChatHandler.test.ts). index.ts
// wires it up.
//
// Order: caller's JWT → body + size limits → the profile is the caller's
// own → prices/budget config → per-account daily quota (consume_ai_quota,
// unchanged) → then two paid calls, each reserved against the monthly
// budget first and reconciled with its own model and tokens:
//   1. the retrieval embedding (a provider failure or timeout here degrades
//      to vocabulary-only grounding, as before; a budget or accounting
//      failure stops the turn);
//   2. the chat completion.

import {
  bearerToken,
  callErrorResponse,
  chatCostUsd,
  chatPricing,
  chatUpperBound,
  corsHeaders,
  embeddingCostUsd,
  embeddingPricing,
  embeddingUpperBound,
  errorResponse,
  isBudgetError,
  jsonResponse,
  meteredCall,
  monthlyBudgetUsd,
  providerFetch,
  quotaErrorResponse,
  type BudgetStore,
  type Env,
  type FetchLike,
  type QuotaResult,
} from '../_shared/aiBudget.ts';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_TIMEOUT_MS = 20_000;
// Keeps a runaway conversation from growing the request (and cost)
// unboundedly — the client only needs recent turns for context anyway.
const MAX_HISTORY_TURNS = 12;
// How many retrieved verified examples to ground a single turn in — enough
// to be useful, small enough to stay cheap.
const MATCH_COUNT = 6;
// Upper bounds on every prompt-bearing field, so one request can't carry
// far more paid input than a real conversation turn. Generous: a real system
// prompt (src/lib/ai/buildSystemPrompt.ts) is a few thousand characters.
const MAX_SYSTEM_PROMPT_CHARS = 20_000;
const MAX_TURN_CHARS = 2_000;
const MAX_RETRIEVAL_QUERY_CHARS = 1_000;
const MAX_HISTORY_ENTRIES = 100;
// Short, cost-bounded replies — this is a conversation practice tool, not a
// long-form generator. Also the output side of the reservation.
const MAX_OUTPUT_TOKENS = 400;
const SIGN_IN_MESSAGE = 'Please sign in to talk with the tutor.';

interface ChatTurn {
  role: 'tutor' | 'learner';
  text: string;
}

interface RequestBody {
  systemPrompt: string;
  history: ChatTurn[];
  learnerMessage: string | null;
  profileId: string;
  retrievalQuery: string;
}

export interface ChatDeps {
  env: Env;
  getUserId: (token: string) => Promise<string | null>;
  /** Whether the profile is one of the caller's own (RLS on profiles, with the caller's JWT). */
  ownsProfile: (token: string, profileId: string) => Promise<boolean>;
  /** consume_ai_quota('chat') run with the caller's JWT. */
  consumeQuota: (token: string, kind: 'chat') => Promise<QuotaResult>;
  /** match_verified_content with the caller's JWT; formatted lines, [] if none. */
  matchVerifiedContent: (token: string, embedding: number[], count: number) => Promise<string[]>;
  /** Logs the turn as a review candidate — best-effort, never blocks the reply. */
  logCorrection: (token: string, profileId: string, aiGeneratedText: string) => Promise<void>;
  store: BudgetStore;
  fetch: FetchLike;
  timeoutMs?: number;
  log?: (message: string, error?: unknown) => void;
}

/** The first prompt field that is the wrong type or over its limit, or null. */
function oversizedField(body: RequestBody): string | null {
  if (typeof body.systemPrompt !== 'string' || body.systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) return 'systemPrompt';
  if (typeof body.retrievalQuery !== 'string' || body.retrievalQuery.length > MAX_RETRIEVAL_QUERY_CHARS) return 'retrievalQuery';
  if (body.learnerMessage != null && (typeof body.learnerMessage !== 'string' || body.learnerMessage.length > MAX_TURN_CHARS)) {
    return 'learnerMessage';
  }
  if (body.history.length > MAX_HISTORY_ENTRIES) return 'history';
  for (const turn of body.history) {
    if (typeof turn?.text !== 'string' || turn.text.length > MAX_TURN_CHARS) return 'history';
  }
  return null;
}

export function createChatHandler(deps: ChatDeps): (req: Request) => Promise<Response> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders() });
    }
    if (req.method !== 'POST') {
      return errorResponse('provider_error', 'Method not allowed', 405);
    }

    const token = bearerToken(req);
    const accountId = token ? await deps.getUserId(token) : null;
    if (!token || !accountId) {
      return errorResponse('unauthorized', SIGN_IN_MESSAGE, 401);
    }

    const apiKey = deps.env('AI_API_KEY');
    if (!apiKey) {
      return errorResponse('not_configured', 'AI_API_KEY is not configured for this project', 500);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_response', 'Malformed request body', 400);
    }
    if (!body.systemPrompt || !Array.isArray(body.history) || !body.profileId || !body.retrievalQuery) {
      return errorResponse('invalid_response', 'Missing systemPrompt, history, profileId, or retrievalQuery', 400);
    }
    const tooBig = oversizedField(body);
    if (tooBig) {
      return errorResponse('invalid_response', `The ${tooBig} field is missing or too long`, 413);
    }

    // The profile must be one of the caller's own, so usage and turns can't
    // be attributed to someone else.
    if (!(await deps.ownsProfile(token, body.profileId))) {
      return errorResponse('forbidden', 'That profile does not belong to this account.', 403);
    }

    const model = deps.env('AI_MODEL') || DEFAULT_MODEL;
    const embeddingModel = deps.env('AI_EMBEDDING_MODEL') || DEFAULT_EMBEDDING_MODEL;
    const chatPrices = chatPricing(deps.env, model);
    if (!chatPrices.ok) return errorResponse('not_configured', chatPrices.message, 500);
    const embeddingPrices = embeddingPricing(deps.env, embeddingModel);
    if (!embeddingPrices.ok) return errorResponse('not_configured', embeddingPrices.message, 500);
    const budget = monthlyBudgetUsd(deps.env);
    if (!budget.ok) return errorResponse('not_configured', budget.message, 500);

    // Per-account daily cap, consumed atomically before any paid call.
    const quota = await deps.consumeQuota(token, 'chat');
    if ('error' in quota) return quotaErrorResponse(quota.error, SIGN_IN_MESSAGE);
    if (quota.allowed !== true) {
      return errorResponse('daily_limit_reached', "You've reached today's conversation limit — come back tomorrow!", 429);
    }

    const baseUrl = deps.env('AI_BASE_URL') || DEFAULT_BASE_URL;
    const metered = { store: deps.store, accountId, profileId: body.profileId, budgetUsd: budget.value, log: deps.log };

    // 1. Retrieval embedding.
    const embedded = await meteredCall<number[] | null, { promptTokens: number; totalTokens?: number }>({
      ...metered,
      callType: 'embedding',
      model: embeddingModel,
      reserveUsd: embeddingUpperBound(embeddingPrices.value, body.retrievalQuery).usd,
      pricing: { ...embeddingPrices.value, unit: 'tokens' },
      costOf: (units) => embeddingCostUsd(embeddingPrices.value, units.promptTokens),
      call: async () => {
        const sent = await providerFetch(
          deps.fetch,
          `${baseUrl}/embeddings`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: embeddingModel, input: body.retrievalQuery }),
          },
          timeoutMs
        );
        if (sent.kind !== 'response') return sent;
        const data = await sent.response.json().catch(() => null);
        const embedding = data?.data?.[0]?.embedding;
        const tokens = data?.usage?.prompt_tokens ?? data?.usage?.total_tokens;
        return {
          kind: 'billed',
          value: Array.isArray(embedding) ? embedding : null,
          units: typeof tokens === 'number' ? { promptTokens: tokens, totalTokens: data?.usage?.total_tokens ?? tokens } : null,
        };
      },
    });
    if (!embedded.ok && isBudgetError(embedded.error)) return callErrorResponse(embedded.error);

    let retrievalSection = '';
    if (embedded.ok && embedded.value) {
      try {
        const lines = await deps.matchVerifiedContent(token, embedded.value, MATCH_COUNT);
        if (lines.length > 0) {
          retrievalSection = `\n\nVerified Tunisian examples (source of truth — prefer these forms over anything else):\n${lines
            .map((line) => `- ${line}`)
            .join('\n')}`;
        }
      } catch {
        // A failed lookup degrades to vocabulary-only grounding, as before.
      }
    }

    // 2. Chat completion.
    const recentHistory = body.history.slice(-MAX_HISTORY_TURNS);
    const messages = [
      { role: 'system', content: body.systemPrompt + retrievalSection },
      ...recentHistory.map((turn) => ({ role: turn.role === 'tutor' ? 'assistant' : 'user', content: turn.text })),
      ...(body.learnerMessage ? [{ role: 'user', content: body.learnerMessage }] : []),
    ];

    const chatted = await meteredCall<string | null, { promptTokens: number; completionTokens: number; totalTokens?: number }>({
      ...metered,
      callType: 'chat',
      model,
      reserveUsd: chatUpperBound(chatPrices.value, messages, MAX_OUTPUT_TOKENS).usd,
      pricing: { ...chatPrices.value, unit: 'tokens', max_output_tokens: MAX_OUTPUT_TOKENS },
      costOf: (units) => chatCostUsd(chatPrices.value, units.promptTokens, units.completionTokens),
      call: async () => {
        const sent = await providerFetch(
          deps.fetch,
          `${baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, max_tokens: MAX_OUTPUT_TOKENS }),
          },
          timeoutMs
        );
        if (sent.kind !== 'response') return sent;
        const completion = await sent.response.json().catch(() => null);
        const raw = completion?.choices?.[0]?.message?.content;
        const usage = completion?.usage;
        const hasUsage = typeof usage?.prompt_tokens === 'number' && typeof usage?.completion_tokens === 'number';
        return {
          kind: 'billed',
          value: typeof raw === 'string' ? raw : null,
          units: hasUsage
            ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens ?? null }
            : null,
        };
      },
    });
    if (!chatted.ok) return callErrorResponse(chatted.error);
    const raw = chatted.value;
    if (raw === null) {
      return errorResponse('invalid_response', 'AI provider response had no message content', 502);
    }

    // Log the turn as a review candidate — best-effort, never blocks the
    // response reaching the learner. Stored as the same {tunisian, english,
    // transliteration} shape the reviewer screen and promotion flow expect.
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.tunisian && parsed?.english) {
        await deps
          .logCorrection(
            token,
            body.profileId,
            JSON.stringify({ tunisian: parsed.tunisian, english: parsed.english, transliteration: parsed.transliteration ?? '' })
          )
          .catch(() => {});
      }
    } catch {
      // Malformed AI output — validateTutorResponse on the client will
      // already surface this as an error; nothing worth logging here.
    }

    return jsonResponse({ raw });
  };
}
