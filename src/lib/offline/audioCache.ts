import { Platform } from 'react-native';
// expo-file-system's Directory/File classes throw ("this.validatePath is not
// a function") the moment they're touched on web — there's no local sandboxed
// filesystem to cache into there anyway, and web is inherently online, so
// every access below is guarded by isWeb and skips caching entirely on that
// platform rather than ever constructing a Directory/File.
import { Directory, File, Paths } from 'expo-file-system';

import { getAudioUrl } from '@/lib/supabase/client';
import type { WordVariant } from '@/types/models';

const isWeb = Platform.OS === 'web';

// Once a variant's audio is in this directory, playback never depends on the
// network again — this is what makes "downloaded" lessons genuinely offline,
// not just cached-until-evicted. Lazily constructed (not at module scope) so
// importing this module is itself safe on web.
let _audioCacheDir: Directory | null = null;
function getAudioCacheDir(): Directory {
  if (!_audioCacheDir) _audioCacheDir = new Directory(Paths.cache, 'audio-cache');
  return _audioCacheDir;
}

function ensureCacheDirExists(): void {
  const dir = getAudioCacheDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * The cache filename is keyed by audioPath AND updatedAt, not audioPath
 * alone. Re-recording a variant reuses the same storage path by design (so
 * the upload overwrites cleanly) — if the local cache keyed off that path
 * alone, *any* device that had already downloaded the old recording (not
 * just the admin's own) would keep serving it forever after a re-record,
 * since there would be no signal that content at that path had changed. A
 * newer updatedAt naturally produces a new cache entry on first fetch; the
 * old versioned file is simply never looked up again (harmless orphan, not
 * actively cleaned up — not worth the complexity for what's a few KB each).
 *
 * Exported (unlike the rest of this module's path-building) purely so this
 * logic is unit-testable without mocking the File/Directory classes.
 */
export function buildCacheFileName(audioPath: string, updatedAt: string): string {
  const flattened = audioPath.replace(/\//g, '__');
  // The version goes *before* the extension: iOS's AVPlayer picks a decoder
  // from a local file's extension, so "x.m4a__<version>" downloads fine but
  // plays silently on iOS (Android sniffs content, and web streams the remote
  // URL, which is why both of those still worked).
  const dot = flattened.lastIndexOf('.');
  const [base, extension] = dot > 0 ? [flattened.slice(0, dot), flattened.slice(dot)] : [flattened, ''];
  return `${base}__${sanitizeForFilename(updatedAt)}${extension}`;
}

function localFileFor(audioPath: string, updatedAt: string): File {
  return new File(getAudioCacheDir(), buildCacheFileName(audioPath, updatedAt));
}

/** Best-effort cleanup of a *pre-versioning* cache entry (bare audioPath,
 * no updatedAt suffix) left over from before this fix — harmless no-op for
 * anything cached after it, since those already use the versioned key above
 * and age out naturally rather than needing active deletion. */
export function invalidateCachedAudio(audioPath: string | null): void {
  if (isWeb || !audioPath) return;
  try {
    const legacyFile = new File(getAudioCacheDir(), audioPath.replace(/\//g, '__'));
    if (legacyFile.exists) legacyFile.delete();
  } catch {
    // No-op: a stale cache is not worth crashing the save flow over.
  }
}

/** Synchronous check: is this exact version of the variant's audio already
 * downloaded? Always false on web — see the isWeb note above. */
export function getCachedAudioUri(variant: Pick<WordVariant, 'audioPath' | 'updatedAt'>): string | null {
  if (isWeb || !variant.audioPath) return null;
  const file = localFileFor(variant.audioPath, variant.updatedAt);
  return file.exists ? file.uri : null;
}

/**
 * File.downloadFileAsync resolves without throwing even when Storage answers
 * with an HTTP error — it just writes the error response body (a few hundred
 * bytes of JSON) to disk as if it were the audio. Real recordings are tens of
 * KB at minimum, so a size floor is the only reliable signal that the
 * "download" was actually an error body.
 */
const MIN_VALID_AUDIO_BYTES = 1024;

export function isAudioFileSizeValid(size: number | null | undefined): boolean {
  return typeof size === 'number' && size >= MIN_VALID_AUDIO_BYTES;
}

function isValidAudioFile(file: File): boolean {
  return isAudioFileSizeValid(file.size);
}

/**
 * Supabase Storage answers a missing object with HTTP 400 (body:
 * "Object not found" / NoSuchKey), not 404 — so a 400/404 here means the
 * variant's audio_path points at a file that was never uploaded (e.g. seeded
 * placeholder content), which is a content gap rather than an app error.
 * Callers fall back to the on-device voice either way.
 */
const warnedUrls = new Set<string>();

/** Warns once per URL per app session — a lesson prefetches every word's
 * audio and each exercise resolves it again, so one missing file would
 * otherwise repeat the same line many times. */
function warnOnce(remoteUrl: string, message: string): void {
  if (warnedUrls.has(remoteUrl)) return;
  warnedUrls.add(remoteUrl);
  console.warn(message);
}

function logUnreachable(remoteUrl: string, status: number, statusText: string): void {
  if (status === 400 || status === 404) {
    warnOnce(remoteUrl, `[audioCache] audio file not found in Storage (${status}) — using the on-device voice: ${remoteUrl}`);
  } else {
    console.error(`[audioCache] HEAD ${remoteUrl} -> ${status} ${statusText}`);
  }
}

/**
 * Returns a playable URI for a variant's audio, preferring the local cache.
 * If not cached yet, attempts a download so future plays work offline. On
 * failure, this distinguishes two cases rather than treating them the same:
 *   - the file genuinely doesn't exist in storage yet (placeholder content
 *     with no recording uploaded) -> returns null, so the UI can honestly
 *     disable the play control instead of wiring up a button that silently
 *     does nothing when tapped.
 *   - a transient issue downloading it locally, but the remote file is
 *     reachable -> falls back to streaming the remote URL directly.
 */
export async function ensureAudioCached(variant: Pick<WordVariant, 'audioPath' | 'updatedAt'>): Promise<string | null> {
  if (!variant.audioPath) return null;

  const cached = getCachedAudioUri(variant);
  if (cached) return cached;

  // Busts CDN/browser caching of the public URL using the variant's own
  // updatedAt — a deterministic value, so this only produces a *new* URL
  // when the content genuinely changed, not on every single fetch (which
  // would defeat the CDN's caching between loads of the same version).
  const remoteUrl = getAudioUrl(variant.audioPath, variant.updatedAt);
  if (!remoteUrl) return null;

  // Web has no local cache to download into (and is inherently online) —
  // just confirm the file is reachable and stream it directly.
  if (isWeb) {
    try {
      const response = await fetch(remoteUrl, { method: 'HEAD' });
      if (!response.ok) {
        logUnreachable(remoteUrl, response.status, response.statusText);
        return null;
      }
      return remoteUrl;
    } catch (err) {
      warnOnce(remoteUrl, `[audioCache] couldn't reach ${remoteUrl} (offline?) — using the on-device voice. ${String(err)}`);
      return null;
    }
  }

  try {
    ensureCacheDirExists();
    // Download to an exact, predictable filename (not the Directory overload,
    // whose name is derived from the URL/response headers) so a later
    // getCachedAudioUri() lookup for this same variant reliably finds it.
    const destination = localFileFor(variant.audioPath, variant.updatedAt);
    const downloaded = await File.downloadFileAsync(remoteUrl, destination);
    if (isValidAudioFile(downloaded)) return downloaded.uri;

    // downloadFileAsync "succeeded" (no throw) but produced a suspiciously
    // small file — almost certainly an HTTP error response body saved as if
    // it were the audio (see MIN_VALID_AUDIO_BYTES above), not real content.
    // Discard it and stream the remote URL directly instead, which doesn't
    // go through this same local-write step.
    console.error(
      `[audioCache] downloadFileAsync for ${remoteUrl} returned a ${downloaded.size ?? 0}-byte file — ` +
        'treating as a failed/corrupt download, not real audio. Falling back to streaming the remote URL directly.'
    );
    try {
      downloaded.delete();
    } catch {
      // No-op.
    }
    const response = await fetch(remoteUrl, { method: 'HEAD' });
    if (!response.ok) {
      logUnreachable(remoteUrl, response.status, response.statusText);
      return null;
    }
    return remoteUrl;
  } catch (downloadErr) {
    // Expected for a missing file (downloadFileAsync rejects on any non-2xx,
    // e.g. Storage's 400 "Object not found") and when offline — not an error
    // in itself. The HEAD check below decides which, and logs accordingly.
    void downloadErr;
    try {
      const response = await fetch(remoteUrl, { method: 'HEAD' });
      if (!response.ok) {
        logUnreachable(remoteUrl, response.status, response.statusText);
        return null;
      }
      return remoteUrl;
    } catch (headErr) {
      // Genuinely offline with nothing cached — no audio available right now.
      warnOnce(remoteUrl, `[audioCache] couldn't reach ${remoteUrl} (offline?) — using the on-device voice. ${String(headErr)}`);
      return null;
    }
  }
}

/** Pre-downloads every variant's audio for a lesson (all labels, not just prompts) so a session can run fully offline. */
export async function prefetchLessonAudio(variants: WordVariant[]): Promise<void> {
  await Promise.all(variants.map((variant) => ensureAudioCached(variant).catch(() => null)));
}
