// Masculine and feminine forms are separate word_variants, each with its own
// pronunciation recording. Recording or replacing one form must never touch
// the other's audio, and a failed save keeps the form's previous recording.
const mockUpload = jest.fn();
const mockRemove = jest.fn();

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
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { saveRecordedWordVariantAudio } = require('@/data/admin/audioUpload');

const MASCULINE = { id: 'v-masc', audioPath: 'tired/v-masc-100.m4a' };
const FEMININE = { id: 'v-fem', audioPath: 'tired/v-fem-200.m4a' };

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockRemove.mockReset().mockResolvedValue({ error: null });
});

it('recording the feminine form stores it under the feminine variant, and only replaces the feminine file', async () => {
  const persisted: { variantId: string; path: string }[] = [];
  const path = await saveRecordedWordVariantAudio({
    localUri: 'file:///take.m4a',
    wordGroupId: 'tired',
    variantId: FEMININE.id,
    previousPath: FEMININE.audioPath,
    persistAudioPath: async (p: string) => {
      persisted.push({ variantId: FEMININE.id, path: p });
      return p;
    },
  });

  expect(path).toMatch(/^tired\/v-fem-\d+\.m4a$/);
  expect(persisted).toEqual([{ variantId: 'v-fem', path }]);
  expect(mockRemove).toHaveBeenCalledWith('audio', [FEMININE.audioPath]);
  expect(mockRemove).not.toHaveBeenCalledWith('audio', [MASCULINE.audioPath]);
});

it('if saving the feminine form fails, its previous recording is kept and the masculine one is untouched', async () => {
  await expect(
    saveRecordedWordVariantAudio({
      localUri: 'file:///take.m4a',
      wordGroupId: 'tired',
      variantId: FEMININE.id,
      previousPath: FEMININE.audioPath,
      persistAudioPath: async () => {
        throw new Error('permission denied');
      },
    })
  ).rejects.toThrow(/previous recording was kept/);

  expect(mockRemove).not.toHaveBeenCalled();
});

it('if the database doesn’t pick up the new path, nothing is deleted and no success is reported', async () => {
  await expect(
    saveRecordedWordVariantAudio({
      localUri: 'file:///take.m4a',
      wordGroupId: 'tired',
      variantId: MASCULINE.id,
      previousPath: MASCULINE.audioPath,
      persistAudioPath: async () => MASCULINE.audioPath, // still the old one
    })
  ).rejects.toThrow(/previous recording was kept/);

  expect(mockRemove).not.toHaveBeenCalled();
});

it('a first recording for a form with none yet deletes nothing', async () => {
  await saveRecordedWordVariantAudio({
    localUri: 'file:///take.m4a',
    wordGroupId: 'tired',
    variantId: MASCULINE.id,
    previousPath: null,
    persistAudioPath: async (p: string) => p,
  });
  expect(mockRemove).not.toHaveBeenCalled();
});
