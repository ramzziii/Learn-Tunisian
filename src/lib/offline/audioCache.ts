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
  return `${audioPath.replace(/\//g, '__')}__${sanitizeForFilename(updatedAt)}`;
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
      return response.ok ? remoteUrl : null;
    } catch {
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
    return downloaded.uri;
  } catch {
    try {
      const response = await fetch(remoteUrl, { method: 'HEAD' });
      return response.ok ? remoteUrl : null;
    } catch {
      // Genuinely offline with nothing cached — no audio available right now.
      return null;
    }
  }
}

/** Pre-downloads every variant's audio for a lesson (all labels, not just prompts) so a session can run fully offline. */
export async function prefetchLessonAudio(variants: WordVariant[]): Promise<void> {
  await Promise.all(variants.map((variant) => ensureAudioCached(variant).catch(() => null)));
}
