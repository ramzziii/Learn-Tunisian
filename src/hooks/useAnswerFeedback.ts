import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

const correctSound = require('../../assets/sounds/correct.wav');
const incorrectSound = require('../../assets/sounds/incorrect.wav');

export interface AnswerFeedbackEffects {
  /** Plays the correct-answer chime + a light success haptic. */
  playCorrect: () => void;
  /** Plays the incorrect-answer tone + a light warning haptic. */
  playIncorrect: () => void;
}

/**
 * The shared "you got it right / wrong" sound + haptic pair used across
 * every alphabet exercise and the matching game — one place to tune the
 * feel of an answer instead of each exercise inventing its own.
 */
export function useAnswerFeedback(): AnswerFeedbackEffects {
  const correctPlayer = useAudioPlayer(correctSound);
  const incorrectPlayer = useAudioPlayer(incorrectSound);

  const playCorrect = useCallback(() => {
    correctPlayer.seekTo(0).then(() => correctPlayer.play());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [correctPlayer]);

  const playIncorrect = useCallback(() => {
    incorrectPlayer.seekTo(0).then(() => incorrectPlayer.play());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [incorrectPlayer]);

  return { playCorrect, playIncorrect };
}
