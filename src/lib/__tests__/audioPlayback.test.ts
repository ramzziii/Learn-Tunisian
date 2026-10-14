// Covers the admin-recording -> upload -> DB save -> learner-playback
// pipeline's cache/versioning logic end to end at the unit level: every
// mock function referenced inside jest.mock() factories below is declared
// with a "mock"-prefixed name, which is the one exemption Jest's
// out-of-scope-variable check allows for module-factory hoisting.

const mockGetPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://example.com/audio/test-file.webm' } }));
const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();

// src/lib/supabase/client.ts imports the real AsyncStorage module at load
// time, whose native module isn't available in plain Jest — none of this
// app's other tests import that file directly for exactly this reason; this
// is the first one that does, so it needs its own mock.
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        getPublicUrl: mockGetPublicUrl,
        upload: mockUpload,
        remove: mockRemove,
      })),
    },
    rpc: mockRpc,
    auth: {
      storage: {},
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })),
}));

jest.mock('expo-file-system', () => {
  class MockFile {
    exists: boolean;
    uri: string;
    constructor(path: unknown) {
      this.exists = false;
      this.uri = `file://${path}`;
    }
    delete() {
      this.exists = false;
    }
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  }

  return {
    Directory: class MockDirectory {
      exists = true;
      create = jest.fn();
      base: string;
      name: string;
      constructor(base: string, name: string) {
        this.base = base;
        this.name = name;
      }
    },
    File: MockFile,
    Paths: { cache: '/cache' },
  };
});

// uploadWordVariantAudio's web code path reads the recording via fetch()
// rather than expo-file-system — mocked here too so the test is robust
// regardless of which platform branch this Jest environment's Platform.OS
// happens to resolve to.
globalThis.fetch = jest.fn(async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(3),
})) as unknown as typeof fetch;

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

// require(), not import — import statements are hoisted above every plain
// statement in the file (including the process.env assignments just above),
// so client.ts's module-load-time env var check would run before they're
// set. require() executes in the order it's written, same reason
// jest.config's own setup files pattern exists for this class of problem.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAudioUrl } = require('@/lib/supabase/client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { invalidateCachedAudio, buildCacheFileName, isAudioFileSizeValid } = require('@/lib/offline/audioCache');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { uploadWordVariantAudio, deleteWordVariantAudio, saveRecordedWordVariantAudio } = require('@/data/admin/audioUpload');

describe('audio playback refresh handling', () => {
  it('adds a cache-busting query string after an upload refresh', () => {
    const url = getAudioUrl('greetings/3aslema.webm', true);
    expect(url).toContain('https://example.com/audio/test-file.webm');
    expect(url).toContain('_=');
  });

  it('does not throw when invalidating a missing cached audio file', () => {
    expect(() => invalidateCachedAudio('greetings/does-not-exist.webm')).not.toThrow();
  });

  // Regression coverage: confirmed against the live project that Supabase's
  // storage endpoint returns 400 for a query string containing a raw ISO
  // datetime's percent-encoded ':'/'+' sequences (e.g. "%3A"/"%2B"), even
  // though they're valid per RFC 3986. word_variant.updatedAt is exactly
  // this shape, so it must be normalized to a plain number before being
  // used as the cache-bust value.
  it('normalizes a raw ISO datetime string to an epoch-ms number instead of percent-encoding it as-is', () => {
    const url = getAudioUrl('greetings/3aslema.m4a', '2026-10-10T22:24:38.514892+00:00');
    expect(url).not.toContain('%3A');
    expect(url).not.toContain('%2B');
    expect(url).toMatch(/_=\d+$/);
  });

  it('still cache-busts correctly with a plain number (e.g. Date.now())', () => {
    const url = getAudioUrl('greetings/3aslema.m4a', 1760145878514);
    expect(url).toContain('_=1760145878514');
  });
});

describe('isAudioFileSizeValid', () => {
  // Regression coverage for the bug where downloadFileAsync "succeeds" (no
  // throw) even when Storage actually returned an HTTP error response body
  // (a few hundred bytes of JSON) instead of real audio — nothing in
  // expo-file-system's JS layer checks the HTTP status before writing to
  // disk, so this size floor is the only signal distinguishing the two.
  it('rejects a tiny file (consistent with a JSON error body, not audio)', () => {
    expect(isAudioFileSizeValid(187)).toBe(false);
  });

  it('rejects a missing/zero size', () => {
    expect(isAudioFileSizeValid(0)).toBe(false);
    expect(isAudioFileSizeValid(null)).toBe(false);
    expect(isAudioFileSizeValid(undefined)).toBe(false);
  });

  it('accepts a file large enough to plausibly be real audio', () => {
    expect(isAudioFileSizeValid(45_000)).toBe(true);
  });
});

describe('buildCacheFileName (local on-device cache key)', () => {
  it('produces a different key when updatedAt changes for the same audioPath', () => {
    const a = buildCacheFileName('greetings/3aslema.webm', '2026-01-01T00:00:00Z');
    const b = buildCacheFileName('greetings/3aslema.webm', '2026-02-01T00:00:00Z');
    expect(a).not.toBe(b);
  });

  it('produces the same key for the same audioPath + updatedAt pair', () => {
    const a = buildCacheFileName('greetings/3aslema.webm', '2026-01-01T00:00:00Z');
    const b = buildCacheFileName('greetings/3aslema.webm', '2026-01-01T00:00:00Z');
    expect(a).toBe(b);
  });

  // Regression: iOS AVPlayer can't play a local file whose name doesn't end
  // in a recognized audio extension — the version suffix used to be appended
  // after ".m4a", so admin recordings played on web/Android but not iOS.
  it('keeps the audio file extension at the end of the cache filename', () => {
    const name = buildCacheFileName('pb_greet_peace/v1-1791851395059.m4a', '2026-10-13T00:29:55.414892+00:00');
    expect(name).toMatch(/\.m4a$/);
    expect(buildCacheFileName('greetings/3aslema.webm', '2026-01-01T00:00:00Z')).toMatch(/\.webm$/);
  });

  it('flattens the path into a filesystem-safe name with no slashes or colons', () => {
    const name = buildCacheFileName('greetings/3aslema.webm', '2026-01-01T00:00:00Z');
    expect(name).not.toMatch(/[/:]/);
  });
});

describe('uploadWordVariantAudio', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockUpload.mockReset();
  });

  it('rejects with a clear message when the caller is not an admin — never attempts the upload', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    await expect(uploadWordVariantAudio('file:///rec.m4a', 'wg1', 'v1')).rejects.toThrow(/admin account/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('surfaces a friendly message when Storage RLS rejects the upload despite passing the admin check', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockUpload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });

    await expect(uploadWordVariantAudio('file:///rec.m4a', 'wg1', 'v1')).rejects.toThrow(/session may have expired/i);
  });

  it('uploads to a path unique per call — a re-recording never reuses the same path', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockUpload.mockResolvedValue({ error: null });
    const dateSpy = jest.spyOn(Date, 'now');

    dateSpy.mockReturnValueOnce(1000);
    const firstPath = await uploadWordVariantAudio('file:///rec1.m4a', 'wg1', 'v1');

    dateSpy.mockReturnValueOnce(2000);
    const secondPath = await uploadWordVariantAudio('file:///rec2.m4a', 'wg1', 'v1');

    dateSpy.mockRestore();

    expect(firstPath).toMatch(/^wg1\/v1-1000\.\w+$/);
    expect(secondPath).toMatch(/^wg1\/v1-2000\.\w+$/);
    expect(firstPath).not.toBe(secondPath);
  });
});

describe('deleteWordVariantAudio', () => {
  beforeEach(() => {
    mockRemove.mockReset();
  });

  it('calls storage.remove with the given path', async () => {
    mockRemove.mockResolvedValue({ error: null });

    await deleteWordVariantAudio('wg1/v1-1000.m4a');

    expect(mockRemove).toHaveBeenCalledWith(['wg1/v1-1000.m4a']);
  });

  it('does not throw even if the remove call itself fails — cleanup is best-effort', async () => {
    mockRemove.mockRejectedValue(new Error('network error'));

    await expect(deleteWordVariantAudio('wg1/v1-1000.m4a')).resolves.toBeUndefined();
  });
});

describe('saveRecordedWordVariantAudio (upload -> persist -> delete previous)', () => {
  beforeEach(() => {
    mockRpc.mockReset().mockResolvedValue({ data: true, error: null });
    mockUpload.mockReset().mockResolvedValue({ error: null });
    mockRemove.mockReset().mockResolvedValue({ error: null });
  });

  const save = (persistAudioPath: (path: string) => Promise<string | null>) =>
    saveRecordedWordVariantAudio({
      localUri: 'file:///rec.m4a',
      wordGroupId: 'wg1',
      variantId: 'v1',
      previousPath: 'wg1/v1-1000.m4a',
      persistAudioPath,
    });

  // Regression: the admin screen's onUploaded used to swallow
  // updateWordVariant errors, so this resolved as a success and deleted the
  // previous file even though word_variants.audio_path still pointed at it.
  it('rejects and keeps the previous file when the database update fails', async () => {
    const persist = jest.fn().mockRejectedValue(new Error('permission denied for table word_variants'));

    await expect(save(persist)).rejects.toThrow(/saving it to this variant failed.*previous recording was kept/i);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('rejects and keeps the previous file when the saved audio_path is not the new one', async () => {
    await expect(save(async () => 'wg1/v1-1000.m4a')).rejects.toThrow(/previous recording was kept/i);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('never persists or deletes anything when the upload itself fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'bucket unavailable' } });
    const persist = jest.fn();

    await expect(save(persist)).rejects.toBeTruthy();
    expect(persist).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('deletes the previous file only after the new path is confirmed saved', async () => {
    const persist = jest.fn(async (path: string) => {
      expect(mockRemove).not.toHaveBeenCalled();
      return path;
    });

    const path = await save(persist);

    expect(path).toMatch(/^wg1\/v1-\d+\.\w+$/);
    expect(mockRemove).toHaveBeenCalledWith(['wg1/v1-1000.m4a']);
  });
});
