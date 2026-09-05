import { useCallback, useState } from 'react';
import * as Speech from 'expo-speech';

export interface LetterSpeech {
  speak: (text: string) => void;
  isSpeaking: boolean;
}

/**
 * Plays Arabic letter/word audio via the on-device TTS engine. There's no
 * Supabase-hosted audio for alphabet content (unlike word_variants), so this
 * mirrors the same on-device-speech fallback already used for mock-mode
 * tutor speech rather than standing up a second content pipeline.
 */
export function useLetterSpeech(): LetterSpeech {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'ar',
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, []);

  return { speak, isSpeaking };
}
