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

  useEffect(() => {
    let cancelled = false;
    setHasAudio(false);
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
            player.play();
          }
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id]);

  const play = useCallback(() => {
    if (!hasAudio) return;
    player.seekTo(0).then(() => player.play());
  }, [player, hasAudio]);

  return { play, isPlaying: status.playing, isResolving, hasAudio };
}
