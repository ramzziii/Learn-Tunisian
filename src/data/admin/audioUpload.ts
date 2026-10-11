import { Platform } from 'react-native';
// expo-file-system's File class throws ("this.validatePath is not a
// function") the moment it's touched on web, same issue already fixed once
// in src/lib/offline/audioCache.ts — missed applying the same guard here
// when this file was first written. On web, useVoiceRecorder's recorded URI
// is a blob: URL (from the browser's MediaRecorder), which plain fetch()
// can read directly as bytes; File/Directory are native-only.
import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase/client';

const AUDIO_BUCKET = 'audio';
const isWeb = Platform.OS === 'web';

/**
 * Uploads a locally recorded file (a file:// URI on native, a blob: URL on
 * web — both from useVoiceRecorder) to the audio bucket and returns the
 * storage path to save on word_variants.audio_path — not the public URL;
 * getAudioUrl() (src/lib/supabase/client.ts) derives that from the path the
 * same way existing seed content does.
 *
 * Path is unique *per upload*, not just per variant:
 * "<wordGroupId>/<variantId>-<uploadedAtMillis>.<ext>". A stable
 * "<wordGroupId>/<variantId>.<ext>" path (what this used to be) depends on
 * whatever CDN/edge cache sits in front of Supabase Storage respecting a
 * cache-busting query string on read — which isn't guaranteed; several CDN
 * configurations cache by path alone and ignore query strings entirely, in
 * which case a re-recording would silently keep serving the previous
 * bytes forever at that same URL, CDN-side, regardless of what the app
 * does. A new path on every upload sidesteps that risk completely — there's
 * no existing cache entry for a path that's never been requested before.
 * The now-orphaned previous path should be deleted via
 * deleteWordVariantAudio() once the new one is confirmed saved — see
 * app/admin/word-groups/[wordGroupId].tsx.
 *
 * Extension/content-type differ by platform because expo-audio's web
 * recorder actually produces webm (see RecordingPresets.HIGH_QUALITY's
 * `web: { mimeType: 'audio/webm' }`), not m4a like native does.
 */
export async function uploadWordVariantAudio(localUri: string, wordGroupId: string, variantId: string): Promise<string> {
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError) {
    throw new Error('Could not verify admin permissions before uploading audio.');
  }
  if (!isAdmin) {
    throw new Error('Audio uploads require an admin account because the audio bucket is write-protected.');
  }

  const extension = isWeb ? 'webm' : localUri.includes('.') ? localUri.split('.').pop() : 'm4a';
  const contentType = isWeb ? 'audio/webm' : `audio/${extension === 'm4a' ? 'mp4' : extension}`;
  const path = `${wordGroupId}/${variantId}-${Date.now()}.${extension}`;

  const bytes = isWeb
    ? new Uint8Array(await (await fetch(localUri)).arrayBuffer())
    : await new File(localUri).bytes();

  // upsert stays true as a harmless safety net (e.g. a retried request after
  // a dropped response) — it should never actually need to overwrite
  // anything now that the path includes the upload timestamp.
  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) {
    // The is_admin RPC above already catches the common case — this is the
    // belt-and-suspenders path for a stale/expired session slipping through
    // that check but still getting rejected by the bucket's own RLS policy.
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new Error('Upload was blocked by Supabase Storage permissions — your admin session may have expired. Try signing in again.');
    }
    throw error;
  }

  return path;
}

/**
 * Best-effort cleanup of a word_variant's previous audio file once a new
 * recording has replaced it (see uploadWordVariantAudio's path-uniqueness
 * note above for why there's something to clean up at all now). Failing to
 * delete an orphaned old file isn't worth failing the save flow over — it's
 * wasted storage, not a correctness problem, since nothing references that
 * path anymore once word_variants.audio_path has moved on.
 */
export async function deleteWordVariantAudio(path: string): Promise<void> {
  try {
    await supabase.storage.from(AUDIO_BUCKET).remove([path]);
  } catch {
    // no-op
  }
}
