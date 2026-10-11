import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AdminAudioRecorderPermission = 'checking' | 'needs-explanation' | 'requesting' | 'denied' | 'ready';

// A generous safety cap so a forgotten open recording doesn't run forever —
// well beyond any real word/phrase recording, so it should never fire under
// normal use. See the note below for why this is a hand-rolled timer rather
// than expo-audio's own `forDuration` option.
const SAFETY_MAX_SECONDS = 180;

export interface AdminAudioRecorder {
  permission: AdminAudioRecorderPermission;
  requestPermission: () => Promise<void>;
  isRecording: boolean;
  durationMillis: number;
  start: () => Promise<void>;
  /** Stops recording (a no-op if it already auto-stopped) and returns the recorded file's local/blob URI, or null if it failed to save. */
  stop: () => Promise<string | null>;
}

/**
 * Manual start/stop recording for admin content audio — a sibling to
 * useVoiceRecorder (src/hooks/useVoiceRecorder.ts), not a reuse of it. That
 * hook passes `forDuration` straight into expo-audio's record(), which on
 * web schedules an internal setTimeout that calls stop() again later — if
 * the recording was already stopped manually before that fires (the normal
 * case here: admin taps Record, then taps Stop whenever they're done, well
 * under any fixed cap), expo-audio's web code never cancels that stale
 * timer, so it fires anyway and throws ("Cannot start an audio recording
 * without initializing a MediaRecorder") trying to stop an already-torn-down
 * recorder. This hook never passes forDuration to expo-audio at all; the
 * safety cap above is our own timer, explicitly cleared on manual stop and
 * on unmount, so it can't leak the same way.
 */
export function useAdminAudioRecorder(): AdminAudioRecorder {
  const [permission, setPermission] = useState<AdminAudioRecorderPermission>('checking');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const safetyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getRecordingPermissionsAsync().then(({ status }) => {
      setPermission(status === 'granted' ? 'ready' : status === 'denied' ? 'denied' : 'needs-explanation');
    });
  }, []);

  useEffect(
    () => () => {
      if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
    },
    []
  );

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
    recorder.record();
    safetyTimeout.current = setTimeout(() => {
      recorder.stop().catch(() => {});
    }, SAFETY_MAX_SECONDS * 1000);
  }, [recorder]);

  const stop = useCallback(async () => {
    if (safetyTimeout.current) {
      clearTimeout(safetyTimeout.current);
      safetyTimeout.current = null;
    }
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
