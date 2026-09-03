// "Talk to a Tunisian" native-reviewer promotion.
//
// The reviewer screen (app/admin/corrections.tsx) sends the FINAL text it
// wants promoted — whether that's the AI's original output unedited
// (approve) or a hand-corrected version (reject-with-correction) — and this
// function does the one privileged thing the client can't do itself:
// compute an embedding (needs the secret key) and insert the verified row.
// It also updates the corrections log row so it drops out of the pending
// queue. Same thin-proxy shape as talk-to-a-tunisian (CORS, timeout, JSON
// error envelope), and same auth model — runs through the caller's own JWT
// (RLS-enforced), not the service-role key.
//
// Deploy: supabase functions deploy talk-review
// Uses the same AI_API_KEY / AI_BASE_URL / AI_EMBEDDING_MODEL secrets as
// talk-to-a-tunisian — nothing new to configure.

import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const REQUEST_TIMEOUT_MS = 20_000;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

interface RequestBody {
  correctionId: string;
  action: 'approve' | 'reject';
  targetTable: 'phrase' | 'sentence';
  tunisianText: string;
  englishText: string;
  transliteration: string;
  topic?: string;
  reviewerName: string;
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

  if (
    !body.correctionId ||
    !body.action ||
    !body.targetTable ||
    !body.tunisianText ||
    !body.englishText ||
    !body.reviewerName
  ) {
    return errorResponse('invalid_response', 'Missing required fields', 400);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const baseUrl = Deno.env.get('AI_BASE_URL') || DEFAULT_BASE_URL;
  const embeddingModel = Deno.env.get('AI_EMBEDDING_MODEL') || DEFAULT_EMBEDDING_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let embedding: number[];
  try {
    const embedResponse = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // Embed all three representations combined, not just the Tunisian text
      // — the learner's message being embedded for retrieval could arrive in
      // English, transliterated Tunisian, or Arabic script depending on what
      // they type/say, so matching against a combined string gives the
      // embedding model signal in whichever form the query turns out to be.
      body: JSON.stringify({
        model: embeddingModel,
        input: `${body.tunisianText} ${body.englishText} ${body.transliteration}`.trim(),
      }),
      signal: controller.signal,
    });
    if (!embedResponse.ok) {
      const detail = await embedResponse.text().catch(() => '');
      return errorResponse('provider_error', `AI provider returned ${embedResponse.status}: ${detail}`.slice(0, 500), 502);
    }
    const embedJson = await embedResponse.json();
    embedding = embedJson?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return errorResponse('invalid_response', 'AI provider returned no embedding', 502);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return errorResponse('timeout', 'Timed out waiting for the AI provider', 504);
    }
    return errorResponse('network', 'Failed to reach the AI provider', 502);
  } finally {
    clearTimeout(timeout);
  }

  const table = body.targetTable === 'phrase' ? 'phrases' : 'sentences';
  const { error: insertError } = await supabase.from(table).insert({
    tunisian_text: body.tunisianText,
    english_text: body.englishText,
    transliteration: body.transliteration || '',
    topic: body.topic ?? null,
    embedding,
    native_verified: true,
    native_reviewer: body.reviewerName,
  });
  if (insertError) {
    return errorResponse('provider_error', `Could not save the verified entry: ${insertError.message}`, 500);
  }

  const isEdited = body.action === 'reject';
  const { error: updateError } = await supabase
    .from('corrections')
    .update({
      is_correct: body.action === 'approve',
      corrected_text: isEdited
        ? JSON.stringify({ tunisian: body.tunisianText, english: body.englishText, transliteration: body.transliteration })
        : null,
      reviewer_name: body.reviewerName,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', body.correctionId);
  if (updateError) {
    // The verified row is already saved — the corrections log just didn't
    // update. Not worth failing the whole request over.
    return jsonResponse({ ok: true, warning: 'Saved, but the review log update failed.' });
  }

  return jsonResponse({ ok: true });
});
