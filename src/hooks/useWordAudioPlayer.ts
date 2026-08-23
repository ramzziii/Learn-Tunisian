import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import { ensureAudioCached } from '@/lib/offline/audioCache';
import type { Word } from '@/types/models';

export interface WordAudioPlayer {
  play: () => void;
  isPlaying: boolean;
  isResolving: boolean;
  /** False when the word has no audio yet (placeholder content) — UI should disable the play control. */
  hasAudio: boolean;
}

/**
 * Wraps expo-audio's player for one word at a time: resolves the best
 * available source (offline cache first, remote fallback) whenever the
 * word changes, and optionally plays it as soon as it's ready.
 */
export function useWordAudioPlayer(word: Word | null, options?: { autoPlay?: boolean }): WordAudioPlayer {
  const autoPlay = options?.autoPlay ?? false;
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [isResolving, setIsResolving] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHasAudio(false);
    if (!word) return;

    setIsResolving(true);
    ensureAudioCached(word)
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
  }, [word?.id]);

  const play = useCallback(() => {
    if (!hasAudio) return;
    player.seekTo(0).then(() => player.play());
  }, [player, hasAudio]);

  return { play, isPlaying: status.playing, isResolving, hasAudio };
}
