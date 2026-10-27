import * as DocumentPicker from 'expo-document-picker';

/** Same ceiling the talk-stt function puts on audio (supabase/functions/talk-stt).
 * A word or phrase clip is a few hundred KB at most; this only catches the
 * wrong file (a whole podcast, a video's audio track). */
export const MAX_AUDIO_UPLOAD_BYTES = 15 * 1024 * 1024;

export interface AudioFormat {
  extension: string;
  contentType: string;
}

export interface PickedAudioFile {
  uri: string;
  name: string;
  format: AudioFormat;
}

// Only formats expo-audio plays on iOS, Android and web alike, so a clip that
// previews fine here also plays for every learner. webm/ogg are left out on
// purpose: iOS can't play them.
const FORMAT_BY_EXTENSION: Record<string, AudioFormat> = {
  mp3: { extension: 'mp3', contentType: 'audio/mpeg' },
  m4a: { extension: 'm4a', contentType: 'audio/mp4' },
  aac: { extension: 'aac', contentType: 'audio/aac' },
  wav: { extension: 'wav', contentType: 'audio/wav' },
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

const UNSUPPORTED_MESSAGE = 'That file type isn’t supported — choose an MP3, M4A, AAC or WAV file.';

export function validateAudioFile(file: {
  name: string;
  mimeType?: string | null;
  size?: number | null;
}): { ok: true; format: AudioFormat } | { ok: false; message: string } {
  const nameExtension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const mimeExtension = file.mimeType ? EXTENSION_BY_MIME[file.mimeType.toLowerCase()] : undefined;
  // The name wins when it has an extension: some Android providers report a
  // generic or wrong MIME type for perfectly good files.
  const format = nameExtension ? FORMAT_BY_EXTENSION[nameExtension] : mimeExtension ? FORMAT_BY_EXTENSION[mimeExtension] : undefined;
  if (!format) return { ok: false, message: UNSUPPORTED_MESSAGE };

  if (file.size === 0) return { ok: false, message: 'That file is empty — choose another one.' };
  if (file.size != null && file.size > MAX_AUDIO_UPLOAD_BYTES) {
    return { ok: false, message: 'That file is too large — audio uploads are limited to 15 MB.' };
  }
  return { ok: true, format };
}

export type PickAudioFileResult =
  | { kind: 'canceled' }
  | { kind: 'picked'; file: PickedAudioFile }
  | { kind: 'invalid'; message: string };

/** Opens the system file picker for one audio file. Never asks for the
 * microphone, and never throws — cancelling is its own (non-error) outcome. */
export async function pickAudioFile(): Promise<PickAudioFileResult> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    // copyToCacheDirectory: the upload reads the bytes via expo-file-system,
    // which needs the copy (see the expo-document-picker docs).
    result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: false, copyToCacheDirectory: true });
  } catch (err) {
    return { kind: 'invalid', message: `Couldn’t open the file picker (${err instanceof Error ? err.message : 'unknown error'}).` };
  }
  if (result.canceled || !result.assets?.length) return { kind: 'canceled' };

  const asset = result.assets[0];
  const validation = validateAudioFile(asset);
  if (!validation.ok) return { kind: 'invalid', message: validation.message };
  return { kind: 'picked', file: { uri: asset.uri, name: asset.name, format: validation.format } };
}
