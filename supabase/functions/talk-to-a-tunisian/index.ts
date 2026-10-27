// "Talk to a Tunisian" AI proxy.
//
// Holds the AI provider's secret API key (which must never reach the Expo
// client). Building the *base* system prompt — scenario instructions, level
// rules, word_groups vocabulary, learner context — stays client-side in
// src/lib/ai/buildSystemPrompt.ts, same as always. This function's own job
// used to be a thin, dumb proxy on top of that; it now also does the RAG
// retrieval step, which is a deliberate, justified exception to "prompt-
// building stays client-side" — embedding the learner's message requires
// the same secret API key, so it structurally cannot happen client-side.
// Everything else about "one implementation, not a second copy" still holds
// for the parts that don't need the secret.
//
// Retrieval/logging queries below run through the caller's forwarded JWT
// (RLS-enforced), not the service-role key. The function does not rely on
// the gateway's JWT check alone (which also admits the public anon key):
// before any paid call it requires the profileId to belong to the caller and
// consumes the caller's per-account daily quota (consume_ai_quota, which
// refuses callers with no user identity — 0018_ai_quota_and_account_email.sql).
//
// Deploy: supabase functions deploy talk-to-a-tunisian
// Configure secrets (never commit these):
//   supabase secrets set AI_API_KEY=sk-...
//   supabase secrets set AI_MODEL=gpt-4o-mini              # optional, this is the default
//   supabase secrets set AI_EMBEDDING_MODEL=text-embedding-3-small   # optional, this is the default
//   supabase secrets set AI_BASE_URL=https://api.openai.com/v1       # optional, this is the default
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-provided by the platform —
// nothing to set for those.

import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const REQUEST_TIMEOUT_MS = 20_000;
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

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

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

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function errorResponse(kind: string, message: string, status: number): Response {
  return jsonResponse({ error: { kind, message } }, status);
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

/** consume_ai_quota failed: no user identity → 401; anything else fails closed. */
function quotaErrorResponse(error: { message?: string; code?: string }): Response {
  if (error.code === '42501' || /not_authenticated/.test(error.message ?? '')) {
    return errorResponse('unauthorized', 'Please sign in to talk with the tutor.', 401);
  }
  return errorResponse('provider_error', 'Could not check your daily usage — please try again.', 503);
}

function supabaseForRequest(req: Request) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function logUsage(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  callType: 'chat' | 'embedding',
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
): Promise<void> {
  if (!usage) return;
  // Best-effort — a logging failure should never break the conversation turn.
  await supabase
    .from('ai_usage_log')
    .insert({
      profile_id: profileId,
      call_type: callType,
      model,
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    })
    .then(
      () => {},
      () => {}
    );
}

/**
 * Embeds `retrievalQuery` and retrieves the top verified examples, formatted
 * as a prompt section. Returns '' (not a throw) on any failure — a bad
 * retrieval call degrades to today's vocabulary-only grounding rather than
 * failing the whole turn.
 */
async function buildRetrievalSection(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  baseUrl: string,
  profileId: string,
  retrievalQuery: string
): Promise<string> {
  const embeddingModel = Deno.env.get('AI_EMBEDDING_MODEL') || DEFAULT_EMBEDDING_MODEL;

  try {
    const embedResponse = await fetchWithTimeout(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModel, input: retrievalQuery }),
    });
    if (!embedResponse.ok) return '';

    const embedJson = await embedResponse.json();
    const embedding = embedJson?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return '';

    await logUsage(supabase, profileId, 'embedding', embeddingModel, embedJson?.usage);

    const { data: matches, error } = await supabase.rpc('match_verified_content', {
      query_embedding: embedding,
      match_count: MATCH_COUNT,
    });
    if (error || !Array.isArray(matches) || matches.length === 0) return '';

    const lines = (matches as { content: string }[]).map((m) => `- ${m.content}`).join('\n');
    return `\n\nVerified Tunisian examples (source of truth — prefer these forms over anything else):\n${lines}`;
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return errorResponse('provider_error', 'Method not allowed', 405);
  }

  const apiKey = Deno.env.get('AI_API_KEY');
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

  const supabase = supabaseForRequest(req);

  // The profile must be one of the caller's own (RLS on profiles only
  // returns those), so usage and turns can't be attributed to someone else.
  const { data: ownProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', body.profileId)
    .maybeSingle();
  if (profileError || !ownProfile) {
    return errorResponse('forbidden', 'That profile does not belong to this account.', 403);
  }

  // Per-account daily cap, consumed atomically before any paid call. Fails
  // closed: an error here never lets the call through.
  const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_quota', { p_kind: 'chat' });
  if (quotaError) {
    return quotaErrorResponse(quotaError);
  }
  if (allowed !== true) {
    return errorResponse('daily_limit_reached', "You've reached today's conversation limit — come back tomorrow!", 429);
  }

  const baseUrl = Deno.env.get('AI_BASE_URL') || DEFAULT_BASE_URL;
  const model = Deno.env.get('AI_MODEL') || DEFAULT_MODEL;

  const retrievalSection = await buildRetrievalSection(supabase, apiKey, baseUrl, body.profileId, body.retrievalQuery);
  const fullSystemPrompt = body.systemPrompt + retrievalSection;

  const recentHistory = body.history.slice(-MAX_HISTORY_TURNS);
  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...recentHistory.map((turn) => ({
      role: turn.role === 'tutor' ? 'assistant' : 'user',
      content: turn.text,
    })),
    ...(body.learnerMessage ? [{ role: 'user', content: body.learnerMessage }] : []),
  ];

  try {
    const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        // Short, cost-bounded replies — this is a conversation practice
        // tool, not a long-form generator.
        max_tokens: 400,
      }),
    });

    if (response.status === 429) {
      return errorResponse('rate_limited', 'The AI provider is rate-limiting requests right now', 429);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return errorResponse('provider_error', `AI provider returned ${response.status}: ${detail}`.slice(0, 500), 502);
    }

    const completion = await response.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') {
      return errorResponse('invalid_response', 'AI provider response had no message content', 502);
    }

    await logUsage(supabase, body.profileId, 'chat', model, completion?.usage);

    // Log the turn as a review candidate — best-effort, never blocks the
    // response reaching the learner. Stored as the same {tunisian, english,
    // transliteration} shape the reviewer screen and promotion flow both
    // expect, parsed straight from what the model returned.
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.tunisian && parsed?.english) {
        await supabase
          .from('corrections')
          .insert({
            profile_id: body.profileId,
            ai_generated_text: JSON.stringify({
              tunisian: parsed.tunisian,
              english: parsed.english,
              transliteration: parsed.transliteration ?? '',
            }),
          })
          .then(
            () => {},
            () => {}
          );
      }
    } catch {
      // Malformed AI output — validateTutorResponse on the client will
      // already surface this as an error; nothing worth logging here.
    }

    return jsonResponse({ raw });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errorResponse('timeout', 'Timed out waiting for the AI provider', 504);
    }
    return errorResponse('network', 'Failed to reach the AI provider', 502);
  }
});
