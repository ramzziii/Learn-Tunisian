// An uploaded file keeps its own format (extension + content type), on every
// platform — unlike a web recording, which is always webm.
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockFetch = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: true, error: null })),
    storage: {
      from: (bucket: string) => ({
        upload: (...a: unknown[]) => mockUpload(bucket, ...a),
        remove: (...a: unknown[]) => mockRemove(bucket, ...a),
      }),
    },
  },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));

function loadWithPlatform(os: 'ios' | 'web') {
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/data/admin/audioUpload') as typeof import('@/data/admin/audioUpload');
}

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockRemove.mockReset().mockResolvedValue({ error: null });
  mockFetch.mockReset().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(3) });
  (globalThis as unknown as { fetch: unknown }).fetch = mockFetch;
});

it.each(['ios', 'web'] as const)('%s: an uploaded MP3 is stored as .mp3 / audio/mpeg', async (os) => {
  const { uploadWordVariantAudio } = loadWithPlatform(os);

  const path = await uploadWordVariantAudio('file:///cache/ahla.mp3', 'wg1', 'v1', { extension: 'mp3', contentType: 'audio/mpeg' });

  expect(path).toMatch(/^wg1\/v1-\d+\.mp3$/);
  expect(mockUpload).toHaveBeenCalledWith('audio', path, expect.any(Uint8Array), { contentType: 'audio/mpeg', upsert: true });
});

it('without a format (a recording), web still stores webm as before', async () => {
  const { uploadWordVariantAudio } = loadWithPlatform('web');

  const path = await uploadWordVariantAudio('blob:http://localhost/abc', 'wg1', 'v1');

  expect(path).toMatch(/\.webm$/);
  expect(mockUpload).toHaveBeenCalledWith('audio', path, expect.any(Uint8Array), { contentType: 'audio/webm', upsert: true });
});

it('the safe save passes the format through to the upload', async () => {
  const { saveRecordedWordVariantAudio } = loadWithPlatform('ios');

  const path = await saveRecordedWordVariantAudio({
    localUri: 'file:///cache/ahla.wav',
    wordGroupId: 'wg1',
    variantId: 'v1',
    previousPath: 'wg1/v1-1000.m4a',
    persistAudioPath: async (p) => p,
    format: { extension: 'wav', contentType: 'audio/wav' },
  });

  expect(path).toMatch(/\.wav$/);
  expect(mockUpload).toHaveBeenCalledWith('audio', path, expect.any(Uint8Array), { contentType: 'audio/wav', upsert: true });
  expect(mockRemove).toHaveBeenCalledWith('audio', ['wg1/v1-1000.m4a']);
});

it('a private bucket can be named (translation answers): upload, persist and old-file cleanup all use it', async () => {
  const { saveRecordedWordVariantAudio } = loadWithPlatform('ios');

  const path = await saveRecordedWordVariantAudio({
    localUri: 'file:///take.m4a',
    wordGroupId: 'req-1',
    variantId: 'answer',
    previousPath: 'req-1/answer-1.m4a',
    persistAudioPath: async (p) => p,
    bucket: 'translation-audio',
  });

  expect(path).toMatch(/^req-1\/answer-\d+\.m4a$/);
  expect(mockUpload).toHaveBeenCalledWith('translation-audio', path, expect.any(Uint8Array), { contentType: 'audio/mp4', upsert: true });
  expect(mockRemove).toHaveBeenCalledWith('translation-audio', ['req-1/answer-1.m4a']);
});
