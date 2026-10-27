import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { saveRecordedWordVariantAudio } from '@/data/admin/audioUpload';
import { useAdminAudioRecorder } from '@/hooks/useAdminAudioRecorder';
import { pickAudioFile, type PickedAudioFile } from '@/lib/admin/audioFile';
import { getAudioUrl, supabase } from '@/lib/supabase/client';
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
  /** When given, every successful recording is followed by "Add this
   * recording to Repeat After Me?". `onDecide` must persist the answer and
   * reject if it couldn't — nothing is confirmed until it resolves. */
  repeatAfterMe?: {
    isIncluded: boolean;
    onDecide: (include: boolean) => Promise<void>;
  };
  /** A private bucket (translation answers) instead of the public content
   * bucket: uploads go there, and the saved audio previews via a signed URL. */
  audioBucket?: string;
}

/**
 * Record (or Upload audio: pick a file) → preview → save for one
 * word_variant's audio. Uploading never needs the microphone, so it stays
 * available when microphone permission is denied. Uses
 * useAdminAudioRecorder (manual start/stop, no fixed duration cap) rather
 * than useVoiceRecorder, which is built for Talk's bounded conversational
 * turns — see that hook's own comment for why reusing it here caused a
 * stale-timer crash.
 */
export function AudioRecorderField({
  wordGroupId,
  variantId,
  currentAudioPath,
  updatedAt,
  onUploaded,
  repeatAfterMe,
  audioBucket,
}: AudioRecorderFieldProps) {
  const recorder = useAdminAudioRecorder();
  // The audio waiting to be saved — a recording's URI or a picked file's.
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  // Set when recordedUri came from Upload audio rather than the recorder.
  const [pickedFile, setPickedFile] = useState<PickedAudioFile | null>(null);
  const [savedAudioPath, setSavedAudioPath] = useState<string | null>(currentAudioPath);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAskingRepeatAfterMe, setIsAskingRepeatAfterMe] = useState(false);
  const [repeatAfterMeDeciding, setRepeatAfterMeDeciding] = useState<boolean | null>(null);
  const [repeatAfterMeMessage, setRepeatAfterMeMessage] = useState<string | null>(null);
  const [repeatAfterMeError, setRepeatAfterMeError] = useState<string | null>(null);
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

  // Private buckets have no public URL: sign one for the saved file instead.
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!audioBucket || !savedAudioPath) {
      setSignedPreviewUrl(null);
      return;
    }
    let isCurrent = true;
    supabase.storage
      .from(audioBucket)
      .createSignedUrl(savedAudioPath, 3600)
      .then(({ data }) => {
        if (isCurrent) setSignedPreviewUrl(data?.signedUrl ?? null);
      })
      .catch(() => {
        if (isCurrent) setSignedPreviewUrl(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [audioBucket, savedAudioPath]);

  const savedPreviewUrl = audioBucket ? signedPreviewUrl : savedAudioPath ? getAudioUrl(savedAudioPath, previewVersion) : null;
  const previewSource = recordedUri ?? savedPreviewUrl;
  const previewPlayer = useAudioPlayer(previewSource ? { uri: previewSource } : null);
  const previewStatus = useAudioPlayerStatus(previewPlayer);

  useEffect(() => {
    if (recorder.permission === 'needs-explanation') recorder.requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decideRepeatAfterMe = async (include: boolean) => {
    if (!repeatAfterMe || repeatAfterMeDeciding !== null) return;
    setRepeatAfterMeError(null);
    setRepeatAfterMeDeciding(include);
    try {
      await repeatAfterMe.onDecide(include);
      setIsAskingRepeatAfterMe(false);
      setRepeatAfterMeMessage(
        include
          ? 'Added to Repeat After Me — learners see it once this word is approved.'
          : repeatAfterMe.isIncluded
            ? 'Removed from Repeat After Me.'
            : 'Not in Repeat After Me.'
      );
    } catch (err) {
      // Keep the question up so the admin can retry; never show success.
      setRepeatAfterMeError(`Couldn't update Repeat After Me: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setRepeatAfterMeDeciding(null);
    }
  };

  const handleRecordPress = async () => {
    setRepeatAfterMeMessage(null);
    setRepeatAfterMeError(null);
    setError(null);
    if (recorder.permission !== 'ready') {
      await recorder.requestPermission();
      return;
    }
    if (recorder.isRecording) {
      const uri = await recorder.stop();
      if (uri) {
        setRecordedUri(uri);
        setPickedFile(null);
      }
      return;
    }
    setRecordedUri(null);
    setPickedFile(null);
    await recorder.start();
  };

  const handleUploadPress = async () => {
    setRepeatAfterMeMessage(null);
    setRepeatAfterMeError(null);
    setError(null);
    const result = await pickAudioFile();
    // Cancelling leaves whatever was there (saved audio or an unsaved take).
    if (result.kind === 'canceled') return;
    if (result.kind === 'invalid') {
      setError(result.message);
      return;
    }
    setSuccessMessage(null);
    setRecordedUri(result.file.uri);
    setPickedFile(result.file);
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
        format: pickedFile?.format,
        ...(audioBucket ? { bucket: audioBucket } : {}),
      });
      setSavedAudioPath(path);
      setPreviewVersion(Date.now());
      setRecordedUri(null);
      setPickedFile(null);
      setSuccessMessage('Audio saved successfully.');
      // Only asked after the new recording is durably saved.
      if (repeatAfterMe) setIsAskingRepeatAfterMe(true);
      if (!audioBucket && previousPath && previousPath !== path) invalidateCachedAudio(previousPath);
    } catch (err) {
      // recordedUri is kept so the admin can retry without re-recording or re-picking.
      setError(err instanceof Error ? err.message : 'Could not upload audio.');
    } finally {
      setIsUploading(false);
    }
  };

  const micDenied = recorder.permission === 'denied';

  return (
    <View style={styles.container}>
      {micDenied ? (
        <Text style={styles.deniedText}>
          Microphone permission denied — enable it in device settings to record audio. You can still upload an audio file.
        </Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

      {repeatAfterMe && isAskingRepeatAfterMe ? (
        <View style={styles.repeatAfterMePrompt}>
          <Text style={styles.repeatAfterMeQuestion}>Add this recording to Repeat After Me?</Text>
          {repeatAfterMeError ? <Text style={styles.errorText}>{repeatAfterMeError}</Text> : null}
          <View style={styles.row}>
            <Button
              label={repeatAfterMe.isIncluded ? 'Remove from Repeat After Me' : 'Not now'}
              variant="ghost"
              onPress={() => decideRepeatAfterMe(false)}
              loading={repeatAfterMeDeciding === false}
              disabled={repeatAfterMeDeciding !== null}
              style={{ flex: 1 }}
            />
            <Button
              label="Add to Repeat After Me"
              onPress={() => decideRepeatAfterMe(true)}
              loading={repeatAfterMeDeciding === true}
              disabled={repeatAfterMeDeciding !== null}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
      {repeatAfterMeMessage ? <Text style={styles.successText}>{repeatAfterMeMessage}</Text> : null}

      {savedAudioPath && !recordedUri ? <Text style={styles.currentPath}>Current: {savedAudioPath}</Text> : null}
      {recordedUri ? (
        <Text style={styles.currentPath}>
          {pickedFile ? `Selected ${pickedFile.name} — preview, then save.` : 'New recording ready — preview, then save.'}
        </Text>
      ) : null}

      <View style={styles.row}>
        {micDenied ? null : (
          <Button
            label={recorder.isRecording ? `Stop (${Math.floor(recorder.durationMillis / 1000)}s)` : 'Record'}
            variant={recorder.isRecording ? 'primary' : 'secondary'}
            onPress={handleRecordPress}
            style={{ flex: 1 }}
          />
        )}
        <Button
          label="Upload audio"
          variant="secondary"
          onPress={handleUploadPress}
          disabled={recorder.isRecording || isUploading}
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
        <Button
          label={pickedFile ? 'Save uploaded audio' : 'Save Recording'}
          onPress={handleSave}
          loading={isUploading}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  currentPath: { fontSize: 11, color: colors.textSecondary },
  successText: { fontSize: 12, color: colors.success },
  repeatAfterMePrompt: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: `${colors.primary}14`,
  },
  repeatAfterMeQuestion: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
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
