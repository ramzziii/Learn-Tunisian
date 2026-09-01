// "Talk to a Tunisian" AI proxy.
//
// This function is deliberately a thin, dumb proxy: it holds the AI
// provider's secret API key (which must never reach the Expo client) and
// forwards an already-built prompt to it. Building the system prompt,
// picking vocabulary, and validating the response all stay client-side in
// src/lib/ai/ — there is exactly one implementation of that logic, shared by
// both the mock provider and this live path, not a second copy living here.
//
// Supabase verifies the caller's JWT automatically before this code runs
// (the default for a deployed function), so every request here is already
// from a signed-in user.
//
// Deploy: supabase functions deploy talk-to-a-tunisian
// Configure secrets (never commit these):
//   supabase secrets set AI_API_KEY=sk-...
//   supabase secrets set AI_MODEL=gpt-4o-mini        # optional, this is the default
//   supabase secrets set AI_BASE_URL=https://api.openai.com/v1   # optional, this is the default
//
// Written against an OpenAI-compatible chat completions API so the provider
// is swappable via AI_BASE_URL/AI_MODEL rather than hardcoded — this hasn't
// been exercised against a live key in this environment, so treat it as
// reviewed-but-unverified until tested with real credentials.

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 20_000;
// Keeps a runaway conversation from growing the request (and cost)
// unboundedly — matches the "keep conversation history limited" cost-control
// requirement. The client only needs recent turns for context anyway.
const MAX_HISTORY_TURNS = 12;

interface ChatTurn {
  role: 'tutor' | 'learner';
  text: string;
}

interface RequestBody {
  systemPrompt: string;
  history: ChatTurn[];
  learnerMessage: string | null;
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

  if (!body.systemPrompt || !Array.isArray(body.history)) {
    return errorResponse('invalid_response', 'Missing systemPrompt or history', 400);
  }

  const recentHistory = body.history.slice(-MAX_HISTORY_TURNS);
  const messages = [
    { role: 'system', content: body.systemPrompt },
    ...recentHistory.map((turn) => ({
      role: turn.role === 'tutor' ? 'assistant' : 'user',
      content: turn.text,
    })),
    ...(body.learnerMessage ? [{ role: 'user', content: body.learnerMessage }] : []),
  ];

  const baseUrl = Deno.env.get('AI_BASE_URL') || DEFAULT_BASE_URL;
  const model = Deno.env.get('AI_MODEL') || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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
      signal: controller.signal,
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

    return jsonResponse({ raw });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errorResponse('timeout', 'Timed out waiting for the AI provider', 504);
    }
    return errorResponse('network', 'Failed to reach the AI provider', 502);
  } finally {
    clearTimeout(timeout);
  }
});
