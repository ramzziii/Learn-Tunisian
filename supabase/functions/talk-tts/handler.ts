// talk-tts request handling — no Deno/npm imports, so it runs under Jest
// (src/__tests__/functions/talkTtsHandler.test.ts). index.ts wires it up.
//
// Order: caller's JWT → body → prices/budget config → per-account daily
// quota (consume_ai_quota, unchanged) → monthly budget reservation → the
// paid text-to-speech call → usage reconciled in characters.

import {
  bearerToken,
  callErrorResponse,
  corsHeaders,
  errorResponse,
  meteredCall,
  monthlyBudgetUsd,
  providerFetch,
  quotaErrorResponse,
  ttsCharacters,
  ttsCostUsd,
  ttsPricing,
  type BudgetStore,
  type Env,
  type FetchLike,
  type QuotaResult,
} from '../_shared/aiBudget.ts';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TTS_MODEL = 'tts-1';
const DEFAULT_TTS_VOICE = 'alloy';
const DEFAULT_TIMEOUT_MS = 20_000;
// Keeps a single request bounded — this speaks one tutor turn at a time, not
// arbitrary long-form text.
const MAX_TEXT_LENGTH = 800;
const SIGN_IN_MESSAGE = 'Please sign in to use audio features.';

export interface TtsDeps {
  env: Env;
  /** The account the JWT belongs to, or null if it isn't a valid session token. */
  getUserId: (token: string) => Promise<string | null>;
  /** consume_ai_quota('tts') run with the caller's JWT. */
  consumeQuota: (token: string, kind: 'tts') => Promise<QuotaResult>;
  store: BudgetStore;
  fetch: FetchLike;
  timeoutMs?: number;
  log?: (message: string, error?: unknown) => void;
}

export function createTtsHandler(deps: TtsDeps): (req: Request) => Promise<Response> {
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

    let body: { text?: unknown };
    try {
      body = await req.json();
    } catch {
      return errorResponse('invalid_response', 'Malformed request body', 400);
    }
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return errorResponse('invalid_response', 'Missing text', 400);
    }
    const text = body.text.slice(0, MAX_TEXT_LENGTH);

    const model = deps.env('AI_TTS_MODEL') || DEFAULT_TTS_MODEL;
    const pricing = ttsPricing(deps.env, model);
    if (!pricing.ok) return errorResponse('not_configured', pricing.message, 500);
    const budget = monthlyBudgetUsd(deps.env);
    if (!budget.ok) return errorResponse('not_configured', budget.message, 500);

    // Per-account daily quota first (also rejects a caller with no user).
    const quota = await deps.consumeQuota(token, 'tts');
    if ('error' in quota) return quotaErrorResponse(quota.error, SIGN_IN_MESSAGE);
    if (quota.allowed !== true) {
      return errorResponse('daily_limit_reached', "You've reached today's audio limit — come back tomorrow!", 429);
    }

    const baseUrl = deps.env('AI_BASE_URL') || DEFAULT_BASE_URL;
    const voice = deps.env('AI_TTS_VOICE') || DEFAULT_TTS_VOICE;
    const characters = ttsCharacters(text);

    const result = await meteredCall<ArrayBuffer | null, { inputCharacters: number }>({
      store: deps.store,
      accountId,
      profileId: null,
      callType: 'tts',
      model,
      budgetUsd: budget.value,
      // Billed per input character, which is known exactly up front.
      reserveUsd: ttsCostUsd(pricing.value, characters),
      pricing: { ...pricing.value, unit: 'characters' },
      costOf: (units) => ttsCostUsd(pricing.value, units.inputCharacters),
      log: deps.log,
      call: async () => {
        const sent = await providerFetch(
          deps.fetch,
          `${baseUrl}/audio/speech`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
          },
          deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        if (sent.kind !== 'response') return sent;
        // Accepted, so billed — even if reading the audio then fails.
        const audio = await sent.response.arrayBuffer().catch(() => null);
        return { kind: 'billed', value: audio, units: { inputCharacters: characters } };
      },
    });

    if (!result.ok) return callErrorResponse(result.error);
    if (!result.value) return errorResponse('network', 'Failed to read the audio from the AI provider', 502);
    return new Response(result.value, { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'audio/mpeg' } });
  };
}
