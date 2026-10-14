import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { saveRecordedWordVariantAudio } from '@/data/admin/audioUpload';
import { useAdminAudioRecorder } from '@/hooks/useAdminAudioRecorder';
import { getAudioUrl } from '@/lib/supabase/client';
import { invalidateCachedAudio } from '@/lib/offline/audioCache';

interface AudioRecorderFieldProps {
  wordGroupId: string;
  variantId: string;
  currentAudioPath: string | null;
  /** The variant's current updatedAt — used to cache-bust the preview URL the
   * same way the learner-facing player does (src/lib/offline/audioCache.ts),
   * so this stays the one consistent mechanism instead of a second ad-hoc one. */
  updatedAt: string;
  /** Called once the new recording has finished uploading, with its storage
   * path — the caller saves it onto the variant and resolves with the
   * audio_path read back from the updated row, or rejects if the save failed.
   * The previous audio file is only deleted once this resolves with the new
   * path, so an old (but working) file is never removed prematurely. */
  onUploaded: (audioPath: string) => Promise<string | null>;
}

/**
 * Record → preview → upload for one word_variant's audio. Uses
 * useAdminAudioRecorder (manual start/stop, no fixed duration cap) rather
 * than useVoiceRecorder, which is built for Talk's bounded conversational
 * turns — see that hook's own comment for why reusing it here caused a
 * stale-timer crash.
 */
export function AudioRecorderField({ wordGroupId, variantId, currentAudioPath, updatedAt, onUploaded }: AudioRecorderFieldProps) {
  const recorder = useAdminAudioRecorder();
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [savedAudioPath, setSavedAudioPath] = useState<string | null>(currentAudioPath);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Starts in sync with the real updatedAt from the DB; bumped to Date.now()
  // immediately on a successful save (below) so the preview doesn't wait on
  // the round-trip that updates the `updatedAt` prop, then re-syncs to the
  // authoritative value once that prop does change — either way it's always
  // a value newer than whatever was cached before.
  const [previewVersion, setPreviewVersion] = useState<string | number>(updatedAt);

  useEffect(() => {
    setSavedAudioPath(currentAudioPath);
  }, [currentAudioPath]);

  useEffect(() => {
    setPreviewVersion(updatedAt);
  }, [updatedAt]);

  const previewSource = recordedUri ?? (savedAudioPath ? getAudioUrl(savedAudioPath, previewVersion) : null);
  const previewPlayer = useAudioPlayer(previewSource ? { uri: previewSource } : null);
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  useEffect(() => {
    if (recorder.permission === 'needs-explanation') recorder.requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRecordPress = async () => {
    setError(null);
    if (recorder.permission !== 'ready') {
      await recorder.requestPermission();
      return;
    }
    if (recorder.isRecording) {
      const uri = await recorder.stop();
      if (uri) setRecordedUri(uri);
      return;
    }
    setRecordedUri(null);
    await recorder.start();
  };

  const handlePlayPreview = () => {
    if (!previewSource) return;
    previewPlayer.seekTo(0).then(() => previewPlayer.play());
  };

  const handleSave = async () => {
    if (!recordedUri) return;
    setError(null);
    setSuccessMessage(null);
    setIsUploading(true);
    const previousPath = savedAudioPath;
    try {
      // Rejects (without deleting the previous file) unless the new path was
      // both uploaded and read back from word_variants.audio_path — so the
      // success state below is only ever reached once that's durable.
      const path = await saveRecordedWordVariantAudio({
        localUri: recordedUri,
        wordGroupId,
        variantId,
        previousPath,
        persistAudioPath: onUploaded,
      });
      setSavedAudioPath(path);
      setPreviewVersion(Date.now());
      setRecordedUri(null);
      setSuccessMessage('Audio saved successfully.');
      if (previousPath && previousPath !== path) invalidateCachedAudio(previousPath);
    } catch (err) {
      // recordedUri is kept so the admin can retry without re-recording.
      setError(err instanceof Error ? err.message : 'Could not upload audio.');
    } finally {
      setIsUploading(false);
    }
  };

  if (recorder.permission === 'denied') {
    return <Text style={styles.deniedText}>Microphone permission denied — enable it in device settings to record audio.</Text>;
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

      {savedAudioPath && !recordedUri ? <Text style={styles.currentPath}>Current: {savedAudioPath}</Text> : null}
      {recordedUri ? <Text style={styles.currentPath}>New recording ready — preview, then save.</Text> : null}

      <View style={styles.row}>
        <Button
          label={recorder.isRecording ? `Stop (${Math.floor(recorder.durationMillis / 1000)}s)` : 'Record'}
          variant={recorder.isRecording ? 'primary' : 'secondary'}
          onPress={handleRecordPress}
          style={{ flex: 1 }}
        />
        <Button
          label={previewStatus.playing ? 'Playing…' : '▶ Preview'}
          variant="ghost"
          disabled={!previewSource || previewStatus.playing}
          onPress={handlePlayPreview}
          style={{ flex: 1 }}
        />
      </View>

      {recordedUri ? (
        <Button label="Save Recording" onPress={handleSave} loading={isUploading} style={{ marginTop: spacing.xs }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  currentPath: { fontSize: 11, color: colors.textSecondary },
  successText: { fontSize: 12, color: colors.success },
  errorText: { fontSize: 12, color: colors.error },
  deniedText: {
    fontSize: 12,
    color: colors.error,
    backgroundColor: `${colors.error}14`,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
});
