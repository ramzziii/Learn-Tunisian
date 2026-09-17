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
          setHasError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id, retryCount]);

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
