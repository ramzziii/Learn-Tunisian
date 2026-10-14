import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import { ensureAudioCached } from '@/lib/offline/audioCache';
import type { WordVariant } from '@/types/models';

export interface WordAudioPlayer {
  play: () => void;
  isPlaying: boolean;
  isResolving: boolean;
  /** False when the variant has no audio yet (placeholder content) — UI should disable the play control. */
  hasAudio: boolean;
  /**
   * True when this word does have an audio_path but resolving it failed
   * this time (e.g. offline with nothing cached yet) — distinct from
   * hasAudio=false, since this is a transient state worth retrying rather
   * than "there's genuinely nothing here."
   */
  hasError: boolean;
  /** Re-attempts resolving audio for the current variant. */
  retry: () => void;
}

/**
 * Wraps expo-audio's player for one word variant at a time: resolves the
 * best available source (offline cache first, remote fallback) whenever the
 * variant changes, and optionally plays it as soon as it's ready.
 */
export function useWordAudioPlayer(
  variant: WordVariant | null,
  options?: { autoPlay?: boolean }
): WordAudioPlayer {
  const autoPlay = options?.autoPlay ?? false;
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [isResolving, setIsResolving] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setHasAudio(false);
    setHasError(false);
    if (!variant) return;

    setIsResolving(true);
    ensureAudioCached(variant)
      .then(async (uri) => {
        if (cancelled) return;
        if (uri) {
          console.log(`[useWordAudioPlayer] variant ${variant.id} (audioPath=${variant.audioPath}) resolved to: ${uri}`);
          player.replace({ uri });
          setHasAudio(true);
          if (autoPlay) {
            await player.seekTo(0);
            // Re-check after the await — if the effect's cleanup already ran
            // (unmounted, or `variant`/`retryCount` changed again) while this
            // was in flight, `player` has been released and calling .play()
            // on it throws. cancelled being false here means we're still
            // current.
            if (cancelled) return;
            player.play();
          }
        } else if (variant.audioPath) {
          // Had a path to try but resolution failed (vs. never having one at all) — worth a retry.
          console.error(
            `[useWordAudioPlayer] variant ${variant.id} has audioPath=${variant.audioPath} but ensureAudioCached returned null — see [audioCache] logs above for why`
          );
          setHasError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
    // audioPath (not just id) is in the dep list deliberately: a component
    // holding this hook doesn't necessarily unmount when the same variant
    // gets re-recorded (e.g. PhraseDetailModal stays mounted across phrase
    // selections, just toggling Modal's `visible`) — without audioPath here,
    // re-opening the same phrase after an admin re-recording would keep
    // playing whatever was already resolved, and since a re-recording's old
    // Storage file is deleted once the new one is saved (see
    // deleteWordVariantAudio in src/data/admin/audioUpload.ts), that stale
    // reference is now a dead link rather than just outdated audio — silent
    // failure instead of "wrong but working."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id, variant?.audioPath, retryCount]);

  const play = useCallback(() => {
    if (!hasAudio) return;
    // Same class of race as the autoPlay path above: if the screen unmounts
    // between the tap and seekTo resolving, `player` may already be
    // released — swallow that instead of crashing on a fire-and-forget play.
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => {});
  }, [player, hasAudio]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  return { play, isPlaying: status.playing, isResolving, hasAudio, hasError, retry };
}
