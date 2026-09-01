import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

import { isUsingMockAiProvider } from '@/lib/ai';
import { fetchTtsAudio } from '@/lib/ai/functionsClient';

export interface TutorSpeech {
  speak: (text: string) => void;
  /** True while resolving audio (live) or synthesizing (mock), or while it's actively playing. */
  isSpeaking: boolean;
  hasError: boolean;
  /** The specific reason the last attempt failed (e.g. the AI provider's own error text), when available — null otherwise. */
  errorMessage: string | null;
  retry: () => void;
}

/**
 * Speaks a tutor turn aloud. In live mode this calls the talk-tts Edge
 * Function and plays the returned mp3; in mock mode it uses the on-device
 * expo-speech engine instead, so mock mode never makes a network call (the
 * same offline guarantee the rest of the mock AI provider already gives).
 */
export function useTutorSpeech(): TutorSpeech {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [isResolving, setIsResolving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastTextRef = useRef<string | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const speakLive = useCallback(
    async (text: string) => {
      setIsResolving(true);
      setHasError(false);
      setErrorMessage(null);
      const result = await fetchTtsAudio(text);
      if (!result.ok) {
        setHasError(true);
        setErrorMessage(result.error.message);
        setIsResolving(false);
        return;
      }
      try {
        lastFileRef.current?.delete();
        const file = new File(Paths.cache, `tutor-speech-${Date.now()}.mp3`);
        file.write(result.bytes);
        lastFileRef.current = file;
        player.replace({ uri: file.uri });
        await player.seekTo(0);
        player.play();
      } catch {
        setHasError(true);
        setErrorMessage("Couldn't play that back.");
      } finally {
        setIsResolving(false);
      }
    },
    [player]
  );

  const speakMock = useCallback((text: string) => {
    setIsResolving(true);
    setHasError(false);
    setErrorMessage(null);
    Speech.speak(text, {
      language: 'ar',
      onDone: () => setIsResolving(false),
      onStopped: () => setIsResolving(false),
      onError: () => {
        setHasError(true);
        setErrorMessage("Couldn't speak that.");
        setIsResolving(false);
      },
    });
  }, []);

  const speak = useCallback(
    (text: string) => {
      lastTextRef.current = text;
      if (isUsingMockAiProvider) speakMock(text);
      else speakLive(text);
    },
    [speakLive, speakMock]
  );

  const retry = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  return { speak, isSpeaking: isResolving || status.playing, hasError, errorMessage, retry };
}
