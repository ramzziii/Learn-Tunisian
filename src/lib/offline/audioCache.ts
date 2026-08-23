import { Directory, File, Paths } from 'expo-file-system';

import { getAudioUrl } from '@/lib/supabase/client';
import type { WordVariant } from '@/types/models';

// Once a variant's audio is in this directory, playback never depends on the
// network again — this is what makes "downloaded" lessons genuinely offline,
// not just cached-until-evicted.
const audioCacheDir = new Directory(Paths.cache, 'audio-cache');

function ensureCacheDirExists(): void {
  if (!audioCacheDir.exists) {
    audioCacheDir.create({ intermediates: true });
  }
}

function localFileFor(audioPath: string): File {
  const fileName = audioPath.replace(/\//g, '__');
  return new File(audioCacheDir, fileName);
}

/** Synchronous check: is this variant's audio already downloaded? */
export function getCachedAudioUri(variant: Pick<WordVariant, 'audioPath'>): string | null {
  if (!variant.audioPath) return null;
  const file = localFileFor(variant.audioPath);
  return file.exists ? file.uri : null;
}

/**
 * Returns a playable URI for a variant's audio, preferring the local cache.
 * If not cached yet, attempts a download so future plays work offline; on
 * failure (e.g. placeholder audio that doesn't exist yet, or no network),
 * falls back to the remote URL so playback can still be attempted, and
 * returns null only if there is no audio at all.
 */
export async function ensureAudioCached(variant: Pick<WordVariant, 'audioPath'>): Promise<string | null> {
  if (!variant.audioPath) return null;

  const cached = getCachedAudioUri(variant);
  if (cached) return cached;

  const remoteUrl = getAudioUrl(variant.audioPath);
  if (!remoteUrl) return null;

  try {
    ensureCacheDirExists();
    // Download to an exact, predictable filename (not the Directory overload,
    // whose name is derived from the URL/response headers) so a later
    // getCachedAudioUri() lookup for this same variant reliably finds it.
    const destination = localFileFor(variant.audioPath);
    const downloaded = await File.downloadFileAsync(remoteUrl, destination);
    return downloaded.uri;
  } catch {
    // Offline, or the file doesn't exist remotely yet (placeholder content).
    // Let the caller try the remote URL directly rather than failing hard.
    return remoteUrl;
  }
}

/** Pre-downloads every variant's audio for a lesson (all labels, not just prompts) so a session can run fully offline. */
export async function prefetchLessonAudio(variants: WordVariant[]): Promise<void> {
  await Promise.all(variants.map((variant) => ensureAudioCached(variant).catch(() => null)));
}
