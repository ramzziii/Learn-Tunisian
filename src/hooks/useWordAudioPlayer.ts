import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import { useLetterSpeech } from '@/hooks/useLetterSpeech';
import { ensureAudioCached } from '@/lib/offline/audioCache';
import type { WordVariant } from '@/types/models';

export interface WordAudioPlayer {
  play: () => void;
  isPlaying: boolean;
  isResolving: boolean;
  /** True whenever tapping play will produce sound — a real recording, or
   * the on-device voice fallback. False only for a variant with no Arabic
   * text to speak at all. */
  hasAudio: boolean;
  /** True when play() will use the on-device voice because no recording is
   * playable (none uploaded yet, the file is missing from Storage, or
   * offline with nothing cached). */
  isFallbackVoice: boolean;
  /**
   * True only when there's a recording to try, it failed to resolve, *and*
   * there's no fallback voice — the one case where retrying is the only
   * option.
   */
  hasError: boolean;
  /** Re-attempts resolving the recording for the current variant. */
  retry: () => void;
}

/**
 * Wraps expo-audio's player for one word variant at a time: resolves the
 * best available source (offline cache first, remote fallback) whenever the
 * variant changes, and optionally plays it as soon as it's ready.
 *
 * When no recording is playable it falls back to on-device TTS of the
 * variant's Arabic — so every exercise ("Listen, then record yourself saying
 * it", listen-and-tap, …) stays usable for placeholder content, the same
 * fallback the phrasebook screens already used on their own.
 */
export function useWordAudioPlayer(
  variant: WordVariant | null,
  options?: {
    autoPlay?: boolean;
    /** Default true. False where only the real recording makes sense (Repeat
     * After Me plays *the admin's* recording to imitate) — a missing
     * recording is then an error to retry, never the device voice. */
    fallbackVoice?: boolean;
  }
): WordAudioPlayer {
  const autoPlay = options?.autoPlay ?? false;
  const allowFallbackVoice = options?.fallbackVoice ?? true;
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const { speak, isSpeaking } = useLetterSpeech();
  const [isResolving, setIsResolving] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordingFailed, setRecordingFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const fallbackText = allowFallbackVoice ? variant?.wordArabic?.trim() || null : null;

  useEffect(() => {
    let cancelled = false;
    setHasRecording(false);
    setRecordingFailed(false);
    if (!variant) return;

    setIsResolving(true);
    ensureAudioCached(variant)
      .then(async (uri) => {
        if (cancelled) return;
        if (uri) {
          player.replace({ uri });
          setHasRecording(true);
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
          return;
        }
        if (variant.audioPath) {
          // Had a path to try but resolution failed (missing file / offline) —
          // ensureAudioCached already logged why, once per file.
          setRecordingFailed(true);
        }
        if (autoPlay && allowFallbackVoice && variant.wordArabic) speak(variant.wordArabic);
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
    if (hasRecording) {
      // Same class of race as the autoPlay path above: if the screen unmounts
      // between the tap and seekTo resolving, `player` may already be
      // released — swallow that instead of crashing on a fire-and-forget play.
      player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => {});
      return;
    }
    if (fallbackText) speak(fallbackText);
  }, [player, hasRecording, fallbackText, speak]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  const isFallbackVoice = !hasRecording && !isResolving && !!fallbackText;

  return {
    play,
    isPlaying: status.playing || isSpeaking,
    isResolving,
    hasAudio: hasRecording || !!fallbackText,
    isFallbackVoice,
    hasError: recordingFailed && !fallbackText,
    retry,
  };
}
