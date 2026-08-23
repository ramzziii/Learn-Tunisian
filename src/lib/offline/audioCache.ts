import { Directory, File, Paths } from 'expo-file-system';

import { getAudioUrl } from '@/lib/supabase/client';
import type { Word } from '@/types/models';

// Once a word's audio is in this directory, playback never depends on the
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

/** Synchronous check: is this word's audio already downloaded? */
export function getCachedAudioUri(word: Pick<Word, 'audioPath'>): string | null {
  if (!word.audioPath) return null;
  const file = localFileFor(word.audioPath);
  return file.exists ? file.uri : null;
}

/**
 * Returns a playable URI for a word's audio, preferring the local cache.
 * If not cached yet, attempts a download so future plays work offline; on
 * failure (e.g. placeholder audio that doesn't exist yet, or no network),
 * falls back to the remote URL so playback can still be attempted, and
 * returns null only if there is no audio at all.
 */
export async function ensureAudioCached(word: Pick<Word, 'audioPath'>): Promise<string | null> {
  if (!word.audioPath) return null;

  const cached = getCachedAudioUri(word);
  if (cached) return cached;

  const remoteUrl = getAudioUrl(word.audioPath);
  if (!remoteUrl) return null;

  try {
    ensureCacheDirExists();
    // Download to an exact, predictable filename (not the Directory overload,
    // whose name is derived from the URL/response headers) so a later
    // getCachedAudioUri() lookup for this same word reliably finds it.
    const destination = localFileFor(word.audioPath);
    const downloaded = await File.downloadFileAsync(remoteUrl, destination);
    return downloaded.uri;
  } catch {
    // Offline, or the file doesn't exist remotely yet (placeholder content).
    // Let the caller try the remote URL directly rather than failing hard.
    return remoteUrl;
  }
}

/** Pre-downloads every word's audio for a lesson so a session can run fully offline. */
export async function prefetchLessonAudio(words: Word[]): Promise<void> {
  await Promise.all(words.map((word) => ensureAudioCached(word).catch(() => null)));
}
