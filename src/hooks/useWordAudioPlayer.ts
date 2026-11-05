import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import { ensureAudioCached } from '@/lib/offline/audioCache';
import type { WordVariant } from '@/types/models';

/** Where a word's sound comes from: a native speaker's recording, or the
 * seeded placeholder text-to-speech file (Modern Standard Arabic, not
 * Tunisian — is_native_voice = false). */
export type WordAudioSource = 'native' | 'computer';

export interface WordAudioPlayer {
  play: () => void;
  isPlaying: boolean;
  isResolving: boolean;
  /** True when tapping play will produce sound (a loaded recording). */
  hasAudio: boolean;
  /** What will play: 'native', 'computer' (screens label it), or null for nothing. */
  source: WordAudioSource | null;
  /** True when there was a recording to try and it failed to load — retrying is the only option. */
  hasError: boolean;
  /** Re-attempts resolving the recording for the current variant. */
  retry: () => void;
}

/**
 * Wraps expo-audio's player for one word variant at a time: resolves the
 * recording (offline cache first, remote fallback) whenever the variant
 * changes.
 *
 * Only a native recording ever autoplays. A computer voice (placeholder
 * audio) plays only when tapped, and screens label it; with nativeOnly
 * (listening and pronunciation exercises) it isn't loaded at all. The
 * phone's own voice is never used in place of a recording — a word without
 * one simply has nothing to play.
 */
export function useWordAudioPlayer(
  variant: WordVariant | null,
  options?: {
    /** Play as soon as it's ready — native recordings only. */
    autoPlay?: boolean;
    /** Listening and pronunciation exercises: ignore computer voices entirely. */
    nativeOnly?: boolean;
  }
): WordAudioPlayer {
  const autoPlay = options?.autoPlay ?? false;
  const nativeOnly = options?.nativeOnly ?? false;
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [isResolving, setIsResolving] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordingFailed, setRecordingFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const isNative = !!variant?.isNativeVoice;
  const usable = !!variant?.audioPath && (isNative || !nativeOnly);

  useEffect(() => {
    let cancelled = false;
    setHasRecording(false);
    setRecordingFailed(false);
    if (!variant || !usable) return;

    setIsResolving(true);
    ensureAudioCached(variant)
      .then(async (uri) => {
        if (cancelled) return;
        if (uri) {
          player.replace({ uri });
          setHasRecording(true);
          if (autoPlay && isNative) {
            await player.seekTo(0);
            // Re-check after the await — if the effect's cleanup already ran
            // (unmounted, or `variant`/`retryCount` changed again) while this
            // was in flight, `player` has been released and calling .play()
            // on it throws. cancelled being false here means we're still
            // current.
            if (cancelled) return;
            player.play();
          }
          return;
        }
        // Had a path to try but resolution failed (missing file / offline) —
        // ensureAudioCached already logged why, once per file.
        setRecordingFailed(true);
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
  }, [variant?.id, variant?.audioPath, variant?.isNativeVoice, nativeOnly, retryCount]);

  const play = useCallback(() => {
    if (!hasRecording) return;
    // Same class of race as the autoPlay path above: if the screen unmounts
    // between the tap and seekTo resolving, `player` may already be
    // released — swallow that instead of crashing on a fire-and-forget play.
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => {});
  }, [player, hasRecording]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  return {
    play,
    isPlaying: status.playing,
    isResolving,
    hasAudio: hasRecording,
    source: hasRecording ? (isNative ? 'native' : 'computer') : null,
    hasError: recordingFailed,
    retry,
  };
}
