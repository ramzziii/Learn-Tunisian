// "Talk to a Tunisian" text-to-speech proxy.
//
// Same "thin dumb proxy" shape as talk-to-a-tunisian: holds the AI
// provider's secret API key and forwards a request to it, nothing else.
// Only called in live mode (EXPO_PUBLIC_TALK_AI_MODE=live) — mock mode uses
// on-device expo-speech instead, so it never reaches this function (see
// src/hooks/useTutorSpeech.ts).
//
// Deploy: supabase functions deploy talk-tts
// Configure secrets (reuses the same AI_API_KEY as talk-to-a-tunisian):
//   supabase secrets set AI_TTS_MODEL=tts-1     # optional, this is the default
//   supabase secrets set AI_TTS_VOICE=alloy     # optional, this is the default
//
// This hasn't been exercised against a live key in this environment — treat
// it as reviewed-but-unverified until tested with real credentials, the same
// as talk-to-a-tunisian was before it was verified via direct curl.

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TTS_MODEL = 'tts-1';
const DEFAULT_TTS_VOICE = 'alloy';
const REQUEST_TIMEOUT_MS = 20_000;
// Keeps a single request bounded — this speaks one tutor turn at a time, not
// arbitrary long-form text.
const MAX_TEXT_LENGTH = 800;

interface RequestBody {
  text: string;
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function errorResponse(kind: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { kind, message } }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
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

  if (typeof body.text !== 'string' || body.text.trim().length === 0) {
    return errorResponse('invalid_response', 'Missing text', 400);
  }
  const text = body.text.slice(0, MAX_TEXT_LENGTH);

  const baseUrl = Deno.env.get('AI_BASE_URL') || DEFAULT_BASE_URL;
  const model = Deno.env.get('AI_TTS_MODEL') || DEFAULT_TTS_MODEL;
  const voice = Deno.env.get('AI_TTS_VOICE') || DEFAULT_TTS_VOICE;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return errorResponse('rate_limited', 'The AI provider is rate-limiting requests right now', 429);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return errorResponse('provider_error', `AI provider returned ${response.status}: ${detail}`.slice(0, 500), 502);
    }

    const audio = await response.arrayBuffer();
    return new Response(audio, { status: 200, headers: { ...corsHeaders(), 'Content-Type': 'audio/mpeg' } });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errorResponse('timeout', 'Timed out waiting for the AI provider', 504);
    }
    return errorResponse('network', 'Failed to reach the AI provider', 502);
  } finally {
    clearTimeout(timeout);
  }
});
