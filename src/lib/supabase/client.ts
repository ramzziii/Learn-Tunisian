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

export function getAudioUrl(audioPath: string | null): string | null {
  if (!audioPath) return null;
  return supabase.storage.from(AUDIO_BUCKET).getPublicUrl(audioPath).data.publicUrl;
}

export function getImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  return supabase.storage.from(IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}
