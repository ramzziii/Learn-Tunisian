// Admin "Upload audio": which picked files are accepted, and how the picker's
// outcomes (cancel, a file, a bad file) are reported.
import { MAX_AUDIO_UPLOAD_BYTES, pickAudioFile, validateAudioFile } from '@/lib/admin/audioFile';

const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockGetDocumentAsync(...a) }));

beforeEach(() => mockGetDocumentAsync.mockReset());

describe('validateAudioFile', () => {
  it.each([
    ['ahla.mp3', 'audio/mpeg', 'mp3', 'audio/mpeg'],
    ['ahla.m4a', 'audio/x-m4a', 'm4a', 'audio/mp4'],
    ['ahla.m4a', 'audio/mp4', 'm4a', 'audio/mp4'],
    ['ahla.aac', 'audio/aac', 'aac', 'audio/aac'],
    ['ahla.wav', 'audio/wav', 'wav', 'audio/wav'],
    ['AHLA.MP3', undefined, 'mp3', 'audio/mpeg'],
  ])('accepts %s (%s) as .%s / %s', (name, mimeType, extension, contentType) => {
    expect(validateAudioFile({ name, mimeType, size: 40_000 })).toEqual({ ok: true, format: { extension, contentType } });
  });

  it('falls back to the MIME type when the name has no extension', () => {
    expect(validateAudioFile({ name: 'voice memo', mimeType: 'audio/mpeg', size: 1 })).toEqual({
      ok: true,
      format: { extension: 'mp3', contentType: 'audio/mpeg' },
    });
  });

  it.each([
    ['clip.webm', 'audio/webm'],
    ['clip.ogg', 'audio/ogg'],
    ['notes.pdf', 'application/pdf'],
    ['photo.jpg', 'image/jpeg'],
    ['mystery', undefined],
  ])('rejects %s (%s) with a message naming the supported formats', (name, mimeType) => {
    const result = validateAudioFile({ name, mimeType, size: 1000 });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/MP3, M4A, AAC or WAV/) });
  });

  it('rejects files over the size limit, and empty files', () => {
    expect(validateAudioFile({ name: 'long.mp3', mimeType: 'audio/mpeg', size: MAX_AUDIO_UPLOAD_BYTES + 1 })).toEqual({
      ok: false,
      message: expect.stringMatching(/too large.*15 MB/),
    });
    expect(validateAudioFile({ name: 'empty.mp3', mimeType: 'audio/mpeg', size: 0 })).toEqual({
      ok: false,
      message: expect.stringMatching(/empty/),
    });
  });

  it('a file exactly at the limit is fine; an unknown size is checked no further', () => {
    expect(validateAudioFile({ name: 'a.mp3', mimeType: 'audio/mpeg', size: MAX_AUDIO_UPLOAD_BYTES }).ok).toBe(true);
    expect(validateAudioFile({ name: 'a.mp3', mimeType: 'audio/mpeg', size: undefined }).ok).toBe(true);
  });
});

describe('pickAudioFile', () => {
  it('opens a single-file audio picker that copies the file where it can be read', async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await pickAudioFile();
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({ type: 'audio/*', multiple: false, copyToCacheDirectory: true });
  });

  it('cancelling is reported as cancelled (not an error)', async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAudioFile()).resolves.toEqual({ kind: 'canceled' });
  });

  it('a supported file comes back with its URI, name and upload format', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/ahla.mp3', name: 'ahla.mp3', mimeType: 'audio/mpeg', size: 30_000 }],
    });
    await expect(pickAudioFile()).resolves.toEqual({
      kind: 'picked',
      file: { uri: 'file:///cache/ahla.mp3', name: 'ahla.mp3', format: { extension: 'mp3', contentType: 'audio/mpeg' } },
    });
  });

  it('an unsupported file is reported as invalid with the reason', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/clip.webm', name: 'clip.webm', mimeType: 'audio/webm', size: 30_000 }],
    });
    await expect(pickAudioFile()).resolves.toEqual({ kind: 'invalid', message: expect.stringMatching(/MP3, M4A, AAC or WAV/) });
  });

  it('a picker that fails to open is reported as invalid, not thrown', async () => {
    mockGetDocumentAsync.mockRejectedValue(new Error('Different document picking in progress'));
    await expect(pickAudioFile()).resolves.toEqual({
      kind: 'invalid',
      message: expect.stringMatching(/Couldn.t open the file picker.*Different document picking in progress/),
    });
  });
});
