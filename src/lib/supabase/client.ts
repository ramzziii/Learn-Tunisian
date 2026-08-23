import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase project values.'
  );
}

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
