import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/client';
import type { AiProviderError } from '@/lib/ai/types';

// The chat proxy (talk-to-a-tunisian) goes through supabase.functions.invoke,
// which only speaks JSON in/out. talk-tts and talk-stt move raw audio bytes
// in one direction each, so they're called directly against the functions
// endpoint instead — same auth (the user's session token, or the anon key
// before one exists) as invoke() sends under the hood, just with a binary
// body/response instead of JSON.
const REQUEST_TIMEOUT_MS = 20_000;

async function callFunction(
  name: string,
  init: { headers: Record<string, string>; body: string | ArrayBuffer }
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? supabaseAnonKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey, ...init.headers },
      body: init.body,
      signal: controller.signal,
    });
  } catch (err) {
    // Surfaced in the Metro logs to make a real connectivity failure
    // distinguishable from the generic message shown in the UI.
    console.error(`[functionsClient] fetch to ${name} failed:`, err);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function toError(response: Response): Promise<AiProviderError> {
  try {
    const data = (await response.json()) as { error?: { kind?: string; message?: string } };
    if (data?.error?.message) {
      return { kind: (data.error.kind as AiProviderError['kind']) ?? 'provider_error', message: data.error.message };
    }
  } catch {
    // Response body wasn't the JSON error envelope — fall through to a generic error below.
  }
  return { kind: 'provider_error', message: `The conversation service returned ${response.status}.` };
}

function toNetworkError(err: unknown): AiProviderError {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'timeout', message: 'Timed out waiting for the conversation service.' };
  }
  return { kind: 'network', message: 'Could not reach the conversation service.' };
}

type BinaryResult = { ok: true; bytes: Uint8Array } | { ok: false; error: AiProviderError };
type TextResult = { ok: true; text: string } | { ok: false; error: AiProviderError };

/** Calls the talk-tts Edge Function, returning the synthesized speech as raw audio bytes (mp3). */
export async function fetchTtsAudio(text: string): Promise<BinaryResult> {
  let response: Response;
  try {
    response = await callFunction('talk-tts', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    return { ok: false, error: toNetworkError(err) };
  }
  if (!response.ok) return { ok: false, error: await toError(response) };
  const buffer = await response.arrayBuffer();
  return { ok: true, bytes: new Uint8Array(buffer) };
}

/** Calls the talk-stt Edge Function with a recorded audio file's bytes, returning the transcribed text. */
export async function transcribeAudio(bytes: Uint8Array, contentType: string): Promise<TextResult> {
  let response: Response;
  try {
    response = await callFunction('talk-stt', {
      headers: { 'Content-Type': contentType },
      // A plain ArrayBuffer body, not a Blob — a self-constructed Blob is a
      // known source of silent fetch failures on React Native's New
      // Architecture, which this app has enabled (see app.json). Copying
      // into a fresh buffer (rather than casting bytes.buffer directly)
      // guards against sending more than the intended view if the
      // Uint8Array doesn't span its whole underlying buffer.
      body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
  } catch (err) {
    return { ok: false, error: toNetworkError(err) };
  }
  if (!response.ok) return { ok: false, error: await toError(response) };
  const data = (await response.json()) as { text?: unknown };
  if (typeof data.text !== 'string' || data.text.trim().length === 0) {
    return { ok: false, error: { kind: 'invalid_response', message: 'No transcription was returned.' } };
  }
  return { ok: true, text: data.text };
}
