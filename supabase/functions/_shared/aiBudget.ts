// Spending controls shared by every Edge Function that calls the paid AI
// provider (talk-to-a-tunisian, talk-tts, talk-stt, talk-review).
//
// No Deno or npm imports, so it runs under Jest too
// (src/__tests__/functions/aiBudget.test.ts). The database half — atomic
// reservations against the monthly budget and the usage log — is
// 0021_ai_monthly_budget.sql. docs/cost-controls.md explains the whole flow.
//
// PRICES ARE ESTIMATES. The defaults below are the provider's published
// list prices for the models this project uses, as of when this was
// written. Review them (and the AI_PRICE_* overrides) whenever a model or
// the provider's pricing changes.

export type AiCallType = 'chat' | 'embedding' | 'tts' | 'stt';

export type Env = (name: string) => string | undefined;

export type ConfigResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const DEFAULT_MONTHLY_BUDGET_USD = 10;

export interface ChatPricing {
  model: string;
  inputPer1MTokens: number;
  outputPer1MTokens: number;
}
export interface EmbeddingPricing {
  model: string;
  per1MTokens: number;
}
export interface TtsPricing {
  model: string;
  per1MCharacters: number;
}
export interface SttPricing {
  model: string;
  perMinute: number;
}

/** USD list prices for the default models (see the note at the top of this file). */
const DEFAULT_CHAT_PRICES: Record<string, { inputPer1MTokens: number; outputPer1MTokens: number }> = {
  'gpt-4o-mini': { inputPer1MTokens: 0.15, outputPer1MTokens: 0.6 },
};
const DEFAULT_EMBEDDING_PRICES: Record<string, number> = {
  'text-embedding-3-small': 0.02,
};
const DEFAULT_TTS_PRICES: Record<string, number> = {
  'tts-1': 15,
};
const DEFAULT_STT_PRICES: Record<string, number> = {
  'whisper-1': 0.006,
};

export const PRICE_ENV = {
  chatInput: 'AI_PRICE_CHAT_INPUT_PER_1M_TOKENS',
  chatOutput: 'AI_PRICE_CHAT_OUTPUT_PER_1M_TOKENS',
  embedding: 'AI_PRICE_EMBEDDING_PER_1M_TOKENS',
  tts: 'AI_PRICE_TTS_PER_1M_CHARACTERS',
  stt: 'AI_PRICE_STT_PER_MINUTE',
} as const;

/** A non-negative finite number from the environment; undefined if unset; null if set but invalid. */
function envNumber(env: Env, name: string): number | undefined | null {
  const raw = env(name);
  if (raw === undefined || raw === '') return undefined;
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function price(env: Env, name: string, fallback: number | undefined, model: string): ConfigResult<number> {
  const fromEnv = envNumber(env, name);
  if (fromEnv === null) return { ok: false, message: `${name} must be a non-negative number.` };
  if (fromEnv !== undefined) return { ok: true, value: fromEnv };
  if (fallback !== undefined) return { ok: true, value: fallback };
  return { ok: false, message: `No price configured for model "${model}" — set ${name}.` };
}

export function monthlyBudgetUsd(env: Env): ConfigResult<number> {
  const value = envNumber(env, 'AI_MONTHLY_BUDGET_USD');
  if (value === null) return { ok: false, message: 'AI_MONTHLY_BUDGET_USD must be a non-negative number.' };
  return { ok: true, value: value ?? DEFAULT_MONTHLY_BUDGET_USD };
}

export function chatPricing(env: Env, model: string): ConfigResult<ChatPricing> {
  const defaults = DEFAULT_CHAT_PRICES[model];
  const input = price(env, PRICE_ENV.chatInput, defaults?.inputPer1MTokens, model);
  if (!input.ok) return input;
  const output = price(env, PRICE_ENV.chatOutput, defaults?.outputPer1MTokens, model);
  if (!output.ok) return output;
  return { ok: true, value: { model, inputPer1MTokens: input.value, outputPer1MTokens: output.value } };
}

export function embeddingPricing(env: Env, model: string): ConfigResult<EmbeddingPricing> {
  const p = price(env, PRICE_ENV.embedding, DEFAULT_EMBEDDING_PRICES[model], model);
  return p.ok ? { ok: true, value: { model, per1MTokens: p.value } } : p;
}

export function ttsPricing(env: Env, model: string): ConfigResult<TtsPricing> {
  const p = price(env, PRICE_ENV.tts, DEFAULT_TTS_PRICES[model], model);
  return p.ok ? { ok: true, value: { model, per1MCharacters: p.value } } : p;
}

export function sttPricing(env: Env, model: string): ConfigResult<SttPricing> {
  const p = price(env, PRICE_ENV.stt, DEFAULT_STT_PRICES[model], model);
  return p.ok ? { ok: true, value: { model, perMinute: p.value } } : p;
}

// ============================================================================
// Cost estimates
// ============================================================================

/** Rounds up to the 8 decimal places the database stores (never down). */
export function roundUpUsd(usd: number): number {
  return Math.ceil(usd * 1e8 - 1e-6) / 1e8;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function chatCostUsd(p: ChatPricing, promptTokens: number, completionTokens: number): number {
  return roundUpUsd((promptTokens * p.inputPer1MTokens + completionTokens * p.outputPer1MTokens) / 1e6);
}

/**
 * Upper bound before the call: a token is never smaller than one UTF-8 byte,
 * plus a few tokens of per-message framing, plus the full max_tokens output.
 */
export function chatUpperBound(p: ChatPricing, messages: { content: string }[], maxOutputTokens: number) {
  const inputTokens = messages.reduce((sum, m) => sum + utf8Bytes(m.content), 0) + 8 * messages.length + 16;
  return { inputTokens, outputTokens: maxOutputTokens, usd: chatCostUsd(p, inputTokens, maxOutputTokens) };
}

export function embeddingCostUsd(p: EmbeddingPricing, tokens: number): number {
  return roundUpUsd((tokens * p.per1MTokens) / 1e6);
}

export function embeddingUpperBound(p: EmbeddingPricing, input: string) {
  const tokens = utf8Bytes(input) + 8;
  return { tokens, usd: embeddingCostUsd(p, tokens) };
}

/** Characters as billed for text-to-speech (UTF-16 length — never fewer than code points). */
export function ttsCharacters(text: string): number {
  return text.length;
}

export function ttsCostUsd(p: TtsPricing, characters: number): number {
  return roundUpUsd((characters * p.per1MCharacters) / 1e6);
}

/**
 * Speech-to-text is billed by audio duration, which isn't known until the
 * provider has decoded the file. Bound it from the size instead: assume a
 * very low bitrate (16 kbps = 2000 bytes per second of audio), so the
 * estimate is longer than any real recording of that size.
 */
export const STT_MIN_BYTES_PER_SECOND = 2000;

export function sttUpperBoundSeconds(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / STT_MIN_BYTES_PER_SECOND));
}

export function sttCostUsd(p: SttPricing, seconds: number): number {
  return roundUpUsd((seconds / 60) * p.perMinute);
}

// ============================================================================
// Reserve → call → reconcile / release / ambiguous
// ============================================================================

export interface UsageUnits {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  inputCharacters?: number | null;
  audioSeconds?: number | null;
}

/** The 0021 budget functions, behind an interface (supabaseBudgetStore.ts implements it). */
export interface BudgetStore {
  /** Returns the reservation id, or null if it would exceed the budget. Throws if the check itself fails. */
  reserve(r: { accountId: string | null; callType: AiCallType; model: string; amountUsd: number; budgetUsd: number }): Promise<string | null>;
  reconcile(r: {
    reservationId: string;
    profileId: string | null;
    units: UsageUnits;
    costUsd: number;
    usageEstimated: boolean;
    pricing: Record<string, unknown>;
  }): Promise<void>;
  release(reservationId: string): Promise<void>;
  markAmbiguous(reservationId: string, reason: string): Promise<void>;
}

export interface CallError {
  kind: string;
  message: string;
  status: number;
}

export type ProviderOutcome<T> =
  /** The provider accepted the request, so it may bill for it. `units` null = it didn't say how much. */
  | { kind: 'billed'; value: T; units: UsageUnits | null }
  /** The provider answered with an error status: nothing billable happened. */
  | { kind: 'not_billed'; error: CallError }
  /** Timeout / network failure: it may or may not have been billed. */
  | { kind: 'ambiguous'; error: CallError; reason: string };

export type MeteredResult<T> = { ok: true; value: T } | { ok: false; error: CallError };

export const BUDGET_EXHAUSTED: CallError = {
  kind: 'budget_exhausted',
  message: 'Talk to a Tunisian is temporarily unavailable. Please try again later.',
  status: 503,
};

const BUDGET_CHECK_FAILED: CallError = {
  kind: 'budget_check_failed',
  message: 'Couldn’t check the AI budget — please try again later.',
  status: 503,
};

const ACCOUNTING_FAILED: CallError = {
  kind: 'accounting_failed',
  message: 'Couldn’t record AI usage — please try again later.',
  status: 500,
};

/** These stop a request outright; anything else is the provider's own failure. */
export function isBudgetError(error: CallError): boolean {
  return error.kind === 'budget_exhausted' || error.kind === 'budget_check_failed' || error.kind === 'accounting_failed';
}

/**
 * One paid provider call under the monthly budget:
 * 1. reserve `reserveUsd` (a conservative upper bound) — refused → budget_exhausted,
 *    failed → budget_check_failed; either way the provider is never called;
 * 2. make the call;
 * 3. billed → reconcile at the actual cost from the reported units (or the
 *    reserved bound, flagged estimated, if none were reported); a failure
 *    here is accounting_failed, never a success;
 *    not billed → release; ambiguous → keep it held (counted) for manual
 *    reconciliation, so retrying can't spend past the cap.
 */
export async function meteredCall<T, U extends UsageUnits>(o: {
  store: BudgetStore;
  accountId: string | null;
  profileId: string | null;
  callType: AiCallType;
  model: string;
  budgetUsd: number;
  reserveUsd: number;
  pricing: Record<string, unknown>;
  costOf: (units: U) => number;
  call: () => Promise<ProviderOutcome<T>>;
  log?: (message: string, error?: unknown) => void;
}): Promise<MeteredResult<T>> {
  const log = o.log ?? (() => {});

  let reservationId: string | null;
  try {
    reservationId = await o.store.reserve({
      accountId: o.accountId,
      callType: o.callType,
      model: o.model,
      amountUsd: o.reserveUsd,
      budgetUsd: o.budgetUsd,
    });
  } catch (err) {
    log(`[ai-budget] reserving ${o.callType} failed — not calling the provider`, err);
    return { ok: false, error: BUDGET_CHECK_FAILED };
  }
  if (!reservationId) return { ok: false, error: BUDGET_EXHAUSTED };

  let outcome: ProviderOutcome<T>;
  try {
    outcome = await o.call();
  } catch (err) {
    outcome = { kind: 'ambiguous', error: { kind: 'network', message: 'Failed to reach the AI provider', status: 502 }, reason: String(err).slice(0, 200) };
  }

  if (outcome.kind === 'billed') {
    const units = outcome.units;
    try {
      await o.store.reconcile({
        reservationId,
        profileId: o.profileId,
        units: units ?? {},
        costUsd: units ? o.costOf(units as U) : o.reserveUsd,
        usageEstimated: units === null,
        pricing: { ...o.pricing, reserved_usd: o.reserveUsd },
      });
    } catch (err) {
      log(`[ai-budget] reconciling ${o.callType} reservation ${reservationId} failed — it stays held at ${o.reserveUsd} USD`, err);
      return { ok: false, error: ACCOUNTING_FAILED };
    }
    return { ok: true, value: outcome.value };
  }

  if (outcome.kind === 'not_billed') {
    try {
      await o.store.release(reservationId);
    } catch (err) {
      log(`[ai-budget] releasing ${o.callType} reservation ${reservationId} failed — it stays held`, err);
    }
    return { ok: false, error: outcome.error };
  }

  try {
    await o.store.markAmbiguous(reservationId, outcome.reason);
  } catch (err) {
    log(`[ai-budget] marking ${o.callType} reservation ${reservationId} ambiguous failed — it stays held`, err);
  }
  return { ok: false, error: outcome.error };
}

// ============================================================================
// Provider HTTP
// ============================================================================

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type ProviderFetchResult =
  | { kind: 'response'; response: Response }
  | { kind: 'not_billed'; error: CallError }
  | { kind: 'ambiguous'; error: CallError; reason: string };

/**
 * Calls the provider with a timeout. A 2xx response is handed back to be
 * read (and billed). An error status means the request was refused, so
 * nothing billable happened. A timeout or network failure is ambiguous —
 * the request may have reached the provider.
 */
export async function providerFetch(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<ProviderFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (response.ok) return { kind: 'response', response };
    if (response.status === 429) {
      return { kind: 'not_billed', error: { kind: 'rate_limited', message: 'The AI provider is rate-limiting requests right now', status: 429 } };
    }
    const detail = await response.text().catch(() => '');
    return {
      kind: 'not_billed',
      error: { kind: 'provider_error', message: `AI provider returned ${response.status}: ${detail}`.slice(0, 500), status: 502 },
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { kind: 'ambiguous', error: { kind: 'timeout', message: 'Timed out waiting for the AI provider', status: 504 }, reason: 'timeout' };
    }
    return { kind: 'ambiguous', error: { kind: 'network', message: 'Failed to reach the AI provider', status: 502 }, reason: 'network error' };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Shared request plumbing
// ============================================================================

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(kind: string, message: string, status: number): Response {
  return jsonResponse({ error: { kind, message } }, status);
}

export function callErrorResponse(error: CallError): Response {
  return errorResponse(error.kind, error.message, error.status);
}

export function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  return match ? match[1] : null;
}

/** consume_ai_quota's result, as the handlers see it. */
export type QuotaResult = { allowed: boolean } | { error: { code?: string; message?: string } };

/** consume_ai_quota failed: no user identity → 401; anything else fails closed. */
export function quotaErrorResponse(error: { code?: string; message?: string }, signInMessage: string): Response {
  if (error.code === '42501' || /not_authenticated/.test(error.message ?? '')) {
    return errorResponse('unauthorized', signInMessage, 401);
  }
  return errorResponse('provider_error', 'Could not check your daily usage — please try again.', 503);
}
