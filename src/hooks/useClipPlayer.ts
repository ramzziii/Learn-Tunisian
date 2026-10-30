import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

import { ensureAudioCached } from '@/lib/offline/audioCache';
import type { WordVariant } from '@/types/models';

export interface ClipPlayer {
  /** Plays `variant`'s recording as clip `key`, stopping whatever was playing. Tapping the same key again replays it from the start. */
  play: (key: string, variant: WordVariant) => Promise<void>;
  /** The clip most recently started. */
  activeKey: string | null;
  isPlaying: (key: string) => boolean;
  isLoading: (key: string) => boolean;
  /** The recording couldn't be loaded (offline and not downloaded yet, or missing) — play(key) again to retry. */
  isUnavailable: (key: string) => boolean;
}

/**
 * Several recordings on one screen (the listening quiz's answer options)
 * sharing ONE expo-audio player, so only one clip can ever play: starting
 * another replaces the current source, which stops it. Sources come from
 * the offline audio cache (ensureAudioCached), so downloaded clips play
 * without a connection. A clip that can't be resolved is reported as
 * unavailable — it is never replaced by device or AI speech, since the
 * point is hearing the native recording.
 */
export function useClipPlayer(): ClipPlayer {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set());
  // Only the latest tap may take over the player: a slow lookup for an
  // earlier tap is discarded when it finally resolves.
  const latestRequest = useRef(0);

  const play = useCallback(
    async (key: string, variant: WordVariant) => {
      const request = ++latestRequest.current;
      setLoadingKey(key);
      let uri: string | null = null;
      try {
        uri = await ensureAudioCached(variant);
      } catch {
        uri = null;
      }
      if (request !== latestRequest.current) return;
      setLoadingKey(null);

      if (!uri) {
        setUnavailable((prev) => new Set(prev).add(key));
        try {
          player.pause();
        } catch {
          // Nothing was loaded yet.
        }
        setActiveKey(null);
        return;
      }

      setUnavailable((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setActiveKey(key);
      try {
        player.replace({ uri });
        await player.seekTo(0);
        if (request === latestRequest.current) player.play();
      } catch {
        // The screen may have unmounted mid-tap and released the player.
      }
    },
    [player]
  );

  return {
    play,
    activeKey,
    isPlaying: (key) => status.playing && activeKey === key,
    isLoading: (key) => loadingKey === key,
    isUnavailable: (key) => unavailable.has(key),
  };
}
