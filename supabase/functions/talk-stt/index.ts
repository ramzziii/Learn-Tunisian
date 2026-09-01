// "Talk to a Tunisian" speech-to-text proxy.
//
// Same "thin dumb proxy" shape as talk-to-a-tunisian: holds the AI
// provider's secret API key and forwards a request to it, nothing else.
// Only called when the learner uses the mic (live mode only — see
// src/hooks/useVoiceRecorder.ts and app/talk/[scenarioId].tsx).
//
// Deploy: supabase functions deploy talk-stt
// No extra secrets beyond the existing AI_API_KEY / AI_BASE_URL.
//
// Whisper has no dedicated Tunisian Derja mode — only standard language
// codes are supported, so transcription accuracy on spoken Derja (vs. MSA
// or another Arabic dialect) is unproven until tested with real speech.
// This hasn't been exercised against a live key in this environment either.

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_STT_MODEL = 'whisper-1';
const REQUEST_TIMEOUT_MS = 20_000;
// A recorded turn is capped client-side at 20s (see useVoiceRecorder.ts);
// this is a generous upper bound on the raw file size that reaches here.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

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

function extensionFor(contentType: string): string {
  if (contentType.includes('m4a') || contentType.includes('mp4')) return 'm4a';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  return 'm4a';
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

  const contentType = req.headers.get('content-type') || 'audio/m4a';
  const audioBytes = await req.arrayBuffer();
  if (audioBytes.byteLength === 0) {
    return errorResponse('invalid_response', 'No audio received', 400);
  }
  if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
    return errorResponse('invalid_response', 'Recording is too large', 400);
  }

  const baseUrl = Deno.env.get('AI_BASE_URL') || DEFAULT_BASE_URL;
  const model = Deno.env.get('AI_STT_MODEL') || DEFAULT_STT_MODEL;

  const form = new FormData();
  form.append('file', new Blob([audioBytes], { type: contentType }), `recording.${extensionFor(contentType)}`);
  form.append('model', model);
  // Without this, Whisper auto-detects the language from the audio and can
  // wildly misfire on a short/ambiguous clip — pinning it to Arabic stops it
  // from transcribing into a completely unrelated script (Hebrew, Korean,
  // etc. have been observed). It still won't recognize Tunisian Derja as its
  // own dialect (Whisper has no such mode), but it will use Arabic script,
  // which is what the rest of the app needs to work with.
  form.append('language', Deno.env.get('AI_STT_LANGUAGE') || 'ar');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (response.status === 429) {
      return errorResponse('rate_limited', 'The AI provider is rate-limiting requests right now', 429);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return errorResponse('provider_error', `AI provider returned ${response.status}: ${detail}`.slice(0, 500), 502);
    }

    const result = await response.json();
    const text = result?.text;
    if (typeof text !== 'string') {
      return errorResponse('invalid_response', 'AI provider response had no transcription text', 502);
    }

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errorResponse('timeout', 'Timed out waiting for the AI provider', 504);
    }
    return errorResponse('network', 'Failed to reach the AI provider', 502);
  } finally {
    clearTimeout(timeout);
  }
});
