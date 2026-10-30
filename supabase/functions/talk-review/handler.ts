// "Talk to a Tunisian" language review — the request handling, kept free of
// Deno and npm imports so it can be run under Jest
// (src/__tests__/functions/talkReviewHandler.test.ts). index.ts wires it to
// Supabase Auth and the service-role client.
//
// The embedding in step 5 is a paid provider call, so it goes through the
// same monthly budget as every other AI call (../_shared/aiBudget.ts,
// 0021_ai_monthly_budget.sql): reserved first, then logged for the
// reviewer's account with its model and tokens.
//
// The reviewer screen (app/admin/corrections.tsx) sends the FINAL text it
// wants promoted — the AI's original output unedited (approve) or a
// hand-corrected version (reject-with-correction). Promoting it makes it
// native-verified material every learner's tutor treats as the source of
// truth, so the order is strict:
//   1. verify the caller's JWT                       → 401
//   2. look the verified user id up in public.reviewers (service role,
//      never anything the client sent; admin status plays no part)
//                                                    → 403 (503 if the lookup fails)
//   3. validate the body                             → 400
//   4. the correction must exist and still be pending → 404 / 409
//   5. embed (reserved against the monthly budget first), claim the pending
//      row, insert the verified row; if the insert fails the claim is
//      released.

import {
  bearerToken,
  callErrorResponse,
  corsHeaders,
  embeddingCostUsd,
  embeddingPricing,
  embeddingUpperBound,
  errorResponse,
  jsonResponse,
  meteredCall,
  monthlyBudgetUsd,
  providerFetch,
  type BudgetStore,
  type Env,
  type FetchLike,
} from '../_shared/aiBudget.ts';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_TIMEOUT_MS = 20_000;

type CorrectionReason = 'too_formal' | 'too_casual' | 'dialected' | 'incorrect' | 'other';

const CORRECTION_REASONS: CorrectionReason[] = ['too_formal', 'too_casual', 'dialected', 'incorrect', 'other'];

interface RequestBody {
  correctionId: string;
  action: 'approve' | 'reject';
  targetTable: 'phrase' | 'sentence';
  tunisianText: string;
  englishText: string;
  transliteration: string;
  topic?: string;
  reviewerName: string;
  /** Why the AI's text needed correcting — only meaningful when action is 'reject'. */
  correctionReason?: CorrectionReason;
}

export interface CorrectionPatch {
  is_correct: boolean;
  corrected_text: string | null;
  reviewer_name: string;
  reviewed_at: string;
  correction_reason: CorrectionReason | null;
}

export interface VerifiedRow {
  tunisian_text: string;
  english_text: string;
  transliteration: string;
  topic: string | null;
  embedding: number[];
  native_verified: true;
  native_reviewer: string;
}

export interface ReviewDeps {
  /** AI_API_KEY, AI_BASE_URL, AI_EMBEDDING_MODEL, AI_MONTHLY_BUDGET_USD, AI_PRICE_EMBEDDING_PER_1M_TOKENS. */
  env: Env;
  fetch: FetchLike;
  store: BudgetStore;
  timeoutMs?: number;
  log?: (message: string, error?: unknown) => void;
  /** The user id the JWT belongs to, or null if it isn't a valid session token. */
  getUserId: (token: string) => Promise<string | null>;
  /** Service-role lookup in public.reviewers. Throws if the lookup itself fails. */
  isReviewer: (userId: string) => Promise<boolean>;
  getCorrection: (id: string) => Promise<{ id: string; isPending: boolean } | null>;
  /** Marks the correction reviewed only if it is still pending; false if someone else got there first. */
  claimCorrection: (id: string, patch: CorrectionPatch) => Promise<boolean>;
  /** Puts a claimed correction back in the pending queue. */
  releaseCorrection: (id: string) => Promise<void>;
  /** Inserts the verified row; returns an error message, or null on success. */
  insertVerified: (table: 'phrases' | 'sentences', row: VerifiedRow) => Promise<string | null>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validate(body: unknown): RequestBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (
    !isNonEmptyString(b.correctionId) ||
    (b.action !== 'approve' && b.action !== 'reject') ||
    (b.targetTable !== 'phrase' && b.targetTable !== 'sentence') ||
    !isNonEmptyString(b.tunisianText) ||
    !isNonEmptyString(b.englishText) ||
    !isNonEmptyString(b.reviewerName) ||
    (b.transliteration !== undefined && typeof b.transliteration !== 'string') ||
    (b.topic !== undefined && b.topic !== null && typeof b.topic !== 'string') ||
    (b.correctionReason !== undefined && !CORRECTION_REASONS.includes(b.correctionReason as CorrectionReason))
  ) {
    return null;
  }
  return {
    correctionId: b.correctionId,
    action: b.action,
    targetTable: b.targetTable,
    tunisianText: b.tunisianText,
    englishText: b.englishText,
    transliteration: (b.transliteration as string | undefined) ?? '',
    topic: (b.topic as string | undefined) ?? undefined,
    reviewerName: b.reviewerName,
    correctionReason: b.correctionReason as CorrectionReason | undefined,
  };
}

export function createReviewHandler(deps: ReviewDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders() });
    }
    if (req.method !== 'POST') {
      return errorResponse('provider_error', 'Method not allowed', 405);
    }

    // 1. Who is calling — from the verified JWT only.
    const token = bearerToken(req);
    const userId = token ? await deps.getUserId(token) : null;
    if (!userId) {
      return errorResponse('unauthenticated', 'Sign in to review language content.', 401);
    }

    // 2. Allowlisted language reviewer? Fails closed if the lookup errors.
    let reviewer: boolean;
    try {
      reviewer = await deps.isReviewer(userId);
    } catch {
      return errorResponse('reviewer_check_failed', 'Couldn’t check reviewer access. Please try again.', 503);
    }
    if (!reviewer) {
      return errorResponse('forbidden', 'Only approved language reviewers can review content.', 403);
    }

    // 3. What to promote.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return errorResponse('invalid_response', 'Malformed request body', 400);
    }
    const body = validate(raw);
    if (!body) {
      return errorResponse('invalid_response', 'Missing or invalid fields', 400);
    }

    const apiKey = deps.env('AI_API_KEY');
    if (!apiKey) {
      return errorResponse('not_configured', 'AI_API_KEY is not configured for this project', 500);
    }
    const embeddingModel = deps.env('AI_EMBEDDING_MODEL') || DEFAULT_EMBEDDING_MODEL;
    const pricing = embeddingPricing(deps.env, embeddingModel);
    if (!pricing.ok) return errorResponse('not_configured', pricing.message, 500);
    const budget = monthlyBudgetUsd(deps.env);
    if (!budget.ok) return errorResponse('not_configured', budget.message, 500);

    // 4. Only a real, still-pending correction can be promoted.
    const correction = await deps.getCorrection(body.correctionId);
    if (!correction) {
      return errorResponse('not_found', 'That correction doesn’t exist.', 404);
    }
    if (!correction.isPending) {
      return errorResponse('already_reviewed', 'That correction has already been reviewed.', 409);
    }

    // 5. Embed all three representations combined, not just the Tunisian
    // text — a learner's retrieval query can arrive in English,
    // transliterated Tunisian, or Arabic script.
    const input = `${body.tunisianText} ${body.englishText} ${body.transliteration}`.trim();
    const baseUrl = deps.env('AI_BASE_URL') || DEFAULT_BASE_URL;
    const embedded = await meteredCall<number[] | null, { promptTokens: number; totalTokens?: number }>({
      store: deps.store,
      accountId: userId,
      profileId: null,
      callType: 'embedding',
      model: embeddingModel,
      budgetUsd: budget.value,
      reserveUsd: embeddingUpperBound(pricing.value, input).usd,
      pricing: { ...pricing.value, unit: 'tokens' },
      costOf: (units) => embeddingCostUsd(pricing.value, units.promptTokens),
      log: deps.log,
      call: async () => {
        const sent = await providerFetch(
          deps.fetch,
          `${baseUrl}/embeddings`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: embeddingModel, input }),
          },
          deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
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
    if (!embedded.ok) return callErrorResponse(embedded.error);
    if (!embedded.value) return errorResponse('invalid_response', 'AI provider returned no embedding', 502);

    const isEdited = body.action === 'reject';
    const claimed = await deps.claimCorrection(body.correctionId, {
      is_correct: body.action === 'approve',
      corrected_text: isEdited
        ? JSON.stringify({ tunisian: body.tunisianText, english: body.englishText, transliteration: body.transliteration })
        : null,
      reviewer_name: body.reviewerName,
      reviewed_at: new Date().toISOString(),
      correction_reason: isEdited ? (body.correctionReason ?? null) : null,
    });
    if (!claimed) {
      return errorResponse('already_reviewed', 'That correction has already been reviewed.', 409);
    }

    const insertError = await deps.insertVerified(body.targetTable === 'phrase' ? 'phrases' : 'sentences', {
      tunisian_text: body.tunisianText,
      english_text: body.englishText,
      transliteration: body.transliteration,
      topic: body.topic ?? null,
      embedding: embedded.value,
      native_verified: true,
      native_reviewer: body.reviewerName,
    });
    if (insertError) {
      await deps.releaseCorrection(body.correctionId);
      return errorResponse('provider_error', `Could not save the verified entry: ${insertError}`, 500);
    }

    return jsonResponse({ ok: true });
  };
}
