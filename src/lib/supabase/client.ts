import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !rawSupabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project values.'
  );
}
// Narrowed to plain `string` (rather than `string | undefined`) now that the
// throw above has guaranteed it, so callers don't need to re-check.
const supabaseUrl: string = rawSupabaseUrl;
const supabaseAnonKey: string = rawSupabaseAnonKey;

// Exposed for the binary (audio) Edge Function calls in src/lib/ai/functionsClient.ts,
// which can't go through supabase.functions.invoke (JSON in/out only) since
// they move raw audio bytes.
export { supabaseUrl, supabaseAnonKey };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const AUDIO_BUCKET = 'audio';
const IMAGES_BUCKET = 'images';

/**
 * Supabase Storage rejects (400) a query string containing a percent-encoded
 * ISO datetime's ':'/'+' — exactly the shape of word_variant.updatedAt — so
 * date-like strings are normalized to epoch ms before use.
 */
function normalizeCacheBust(cacheBust: string | number | true): string | number {
  if (cacheBust === true) return Date.now();
  if (typeof cacheBust === 'number') return cacheBust;
  const parsed = Date.parse(cacheBust);
  // Hermes's Date.parse is stricter than V8's about some ISO shapes (e.g. 6
  // fractional digits) — fall back to the digits alone rather than the raw string.
  return Number.isNaN(parsed) ? cacheBust.replace(/\D/g, '') || cacheBust : parsed;
}

/**
 * `cacheBust` defeats CDN/browser caching of the public URL — pass `true`
 * for an immediate one-off bust (e.g. right after an admin's own upload), or
 * a stable value (e.g. a word_variant's `updatedAt`) so the URL only
 * changes when the content actually does, rather than on every single call
 * (which would defeat the CDN's caching entirely).
 */
export function getAudioUrl(audioPath: string | null, cacheBust?: string | number | boolean): string | null {
  if (!audioPath) return null;
  const url = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(audioPath).data.publicUrl;
  if (!cacheBust) return url;
  return `${url}${url.includes('?') ? '&' : '?'}_=${encodeURIComponent(String(normalizeCacheBust(cacheBust)))}`;
}

export function getImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  return supabase.storage.from(IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}
