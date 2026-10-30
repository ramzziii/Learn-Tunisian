// talk-stt request handling — no Deno/npm imports, so it runs under Jest
// (src/__tests__/functions/talkSttHandler.test.ts). index.ts wires it up.
//
// Order: caller's JWT → upload size → prices/budget config → per-account
// daily quota (consume_ai_quota, unchanged) → monthly budget reservation
// (a conservative bound from the file size) → the paid transcription →
// usage reconciled in audio seconds.
//
// Whisper has no dedicated Tunisian Derja mode — only standard language
// codes are supported, so transcription accuracy on spoken Derja (vs. MSA
// or another Arabic dialect) is unproven until tested with real speech.

import {
  bearerToken,
  callErrorResponse,
  corsHeaders,
  errorResponse,
  jsonResponse,
  meteredCall,
  monthlyBudgetUsd,
  providerFetch,
  quotaErrorResponse,
  sttCostUsd,
  sttPricing,
  sttUpperBoundSeconds,
  type BudgetStore,
  type Env,
  type FetchLike,
  type QuotaResult,
} from '../_shared/aiBudget.ts';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_STT_MODEL = 'whisper-1';
const DEFAULT_TIMEOUT_MS = 20_000;
// A recorded turn is capped client-side at 20s (see useVoiceRecorder.ts);
// this is a generous upper bound on the raw file size that reaches here.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const SIGN_IN_MESSAGE = 'Please sign in to use audio features.';

export interface SttDeps {
  env: Env;
  getUserId: (token: string) => Promise<string | null>;
  /** consume_ai_quota('stt') run with the caller's JWT. */
  consumeQuota: (token: string, kind: 'stt') => Promise<QuotaResult>;
  store: BudgetStore;
  fetch: FetchLike;
  timeoutMs?: number;
  log?: (message: string, error?: unknown) => void;
}

function extensionFor(contentType: string): string {
  if (contentType.includes('m4a') || contentType.includes('mp4')) return 'm4a';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  return 'm4a';
}

export function createSttHandler(deps: SttDeps): (req: Request) => Promise<Response> {
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

    const contentType = req.headers.get('content-type') || 'audio/m4a';
    // Refuse an oversized upload before buffering it into memory.
    const declaredLength = Number(req.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_AUDIO_BYTES) {
      return errorResponse('invalid_response', 'Recording is too large', 413);
    }
    const audioBytes = await req.arrayBuffer();
    if (audioBytes.byteLength === 0) {
      return errorResponse('invalid_response', 'No audio received', 400);
    }
    if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
      return errorResponse('invalid_response', 'Recording is too large', 400);
    }

    const model = deps.env('AI_STT_MODEL') || DEFAULT_STT_MODEL;
    const pricing = sttPricing(deps.env, model);
    if (!pricing.ok) return errorResponse('not_configured', pricing.message, 500);
    const budget = monthlyBudgetUsd(deps.env);
    if (!budget.ok) return errorResponse('not_configured', budget.message, 500);

    const quota = await deps.consumeQuota(token, 'stt');
    if ('error' in quota) return quotaErrorResponse(quota.error, SIGN_IN_MESSAGE);
    if (quota.allowed !== true) {
      return errorResponse('daily_limit_reached', "You've reached today's audio limit — come back tomorrow!", 429);
    }

    const baseUrl = deps.env('AI_BASE_URL') || DEFAULT_BASE_URL;
    // whisper-1 reports the audio duration only in verbose_json; other
    // transcription models don't support it, so they're logged at the
    // reserved upper bound instead.
    const reportsDuration = model.startsWith('whisper');

    const form = new FormData();
    form.append('file', new Blob([audioBytes], { type: contentType }), `recording.${extensionFor(contentType)}`);
    form.append('model', model);
    // Without this, Whisper auto-detects the language from the audio and can
    // wildly misfire on a short/ambiguous clip — pinning it to Arabic stops it
    // from transcribing into a completely unrelated script.
    form.append('language', deps.env('AI_STT_LANGUAGE') || 'ar');
    form.append('response_format', reportsDuration ? 'verbose_json' : 'json');

    const result = await meteredCall<string | null, { audioSeconds: number }>({
      store: deps.store,
      accountId,
      profileId: null,
      callType: 'stt',
      model,
      budgetUsd: budget.value,
      reserveUsd: sttCostUsd(pricing.value, sttUpperBoundSeconds(audioBytes.byteLength)),
      pricing: { ...pricing.value, unit: 'audio_seconds', upload_bytes: audioBytes.byteLength },
      costOf: (units) => sttCostUsd(pricing.value, units.audioSeconds),
      log: deps.log,
      call: async () => {
        const sent = await providerFetch(
          deps.fetch,
          `${baseUrl}/audio/transcriptions`,
          { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form },
          deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        if (sent.kind !== 'response') return sent;
        const data = (await sent.response.json().catch(() => null)) as { text?: unknown; duration?: unknown } | null;
        const text = typeof data?.text === 'string' ? data.text : null;
        const seconds = typeof data?.duration === 'number' && data.duration >= 0 ? data.duration : null;
        return { kind: 'billed', value: text, units: seconds === null ? null : { audioSeconds: seconds } };
      },
    });

    if (!result.ok) return callErrorResponse(result.error);
    if (result.value === null) {
      return errorResponse('invalid_response', 'AI provider response had no transcription text', 502);
    }
    return jsonResponse({ text: result.value });
  };
}
