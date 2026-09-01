import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

export type VoiceRecorderPermission = 'checking' | 'needs-explanation' | 'requesting' | 'denied' | 'ready';

// Bounds STT cost/latency for a single turn — this is a quick conversational
// reply, not a monologue.
const MAX_RECORDING_SECONDS = 20;

export interface VoiceRecorder {
  permission: VoiceRecorderPermission;
  requestPermission: () => Promise<void>;
  isRecording: boolean;
  durationMillis: number;
  start: () => Promise<void>;
  /** Stops recording (a no-op if it already auto-stopped) and returns the recorded file's local URI, or null if it failed to save. */
  stop: () => Promise<string | null>;
}

/**
 * Records the learner's spoken turn for "Talk to a Tunisian". Deliberately a
 * separate hook from SpeakingPractice's inline recording logic (which this
 * mirrors closely) rather than a shared refactor of it — SpeakingPractice is
 * a working, already-tested exercise flow, and this feature's needs (a
 * bounded auto-stop duration, a raw file handed off to STT rather than
 * played back locally) are different enough to not force through one
 * abstraction yet.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const [permission, setPermission] = useState<VoiceRecorderPermission>('checking');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

  useEffect(() => {
    getRecordingPermissionsAsync().then(({ status }) => {
      setPermission(status === 'granted' ? 'ready' : status === 'denied' ? 'denied' : 'needs-explanation');
    });
  }, []);

  const requestPermission = useCallback(async () => {
    setPermission('requesting');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const { status } = await requestRecordingPermissionsAsync();
      setPermission(status === 'granted' ? 'ready' : 'denied');
    } catch {
      setPermission('denied');
    }
  }, []);

  const start = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: MAX_RECORDING_SECONDS });
  }, [recorder]);

  const stop = useCallback(async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
    }
    return recorder.uri ?? null;
  }, [recorder, recorderState.isRecording]);

  return {
    permission,
    requestPermission,
    isRecording: recorderState.isRecording,
    durationMillis: recorderState.durationMillis,
    start,
    stop,
  };
}
