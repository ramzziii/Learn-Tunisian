// Learner playback refresh: after an admin re-records a variant (new
// audio_path, new updated_at), what does ensureAudioCached hand the player?
// Covers the native cache/download/fallback paths and the web streaming path.

const mockExistingFiles = new Set<string>();
const mockDownload = jest.fn();
const mockFetch = jest.fn();

jest.mock('expo-file-system', () => {
  class MockFile {
    name: string;
    uri: string;
    size: number | null = null;
    constructor(_dir: unknown, name: string) {
      this.name = name;
      this.uri = `file:///cache/${name}`;
    }
    get exists() {
      return mockExistingFiles.has(this.name);
    }
    delete() {
      mockExistingFiles.delete(this.name);
    }
    static downloadFileAsync(...args: unknown[]) {
      return mockDownload(...args);
    }
  }
  return {
    File: MockFile,
    Directory: class {
      exists = true;
      create() {}
    },
    Paths: { cache: '/cache' },
  };
});

jest.mock('@/lib/supabase/client', () => ({
  getAudioUrl: (path: string | null, version?: string) => (path ? `https://cdn.test/audio/${path}?_=${version}` : null),
}));

globalThis.fetch = mockFetch as unknown as typeof fetch;

const variant = (audioPath: string | null, updatedAt = '2026-10-13T00:00:00Z') => ({ audioPath, updatedAt });

function loadAudioCache(platform: 'ios' | 'web') {
  let mod: typeof import('@/lib/offline/audioCache');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('@/lib/offline/audioCache');
  });
  return mod!;
}

beforeEach(() => {
  mockExistingFiles.clear();
  mockDownload.mockReset();
  mockFetch.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('ensureAudioCached on a device', () => {
  const cache = loadAudioCache('ios');

  it('no recording yet → null without touching the network', async () => {
    await expect(cache.ensureAudioCached(variant(null))).resolves.toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('already cached (same path + version) → plays the local file offline', async () => {
    const v = variant('wg1/v1-2000.m4a');
    mockExistingFiles.add(cache.buildCacheFileName(v.audioPath!, v.updatedAt));

    const uri = await cache.ensureAudioCached(v);

    expect(uri).toMatch(/^file:\/\/\/cache\/.*\.m4a$/);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('after a re-recording, the old cached copy is NOT reused — the new version is downloaded', async () => {
    const old = variant('wg1/v1-1000.m4a', '2026-10-01T00:00:00Z');
    mockExistingFiles.add(cache.buildCacheFileName(old.audioPath!, old.updatedAt));
    const rerecorded = variant('wg1/v1-2000.m4a', '2026-10-13T00:00:00Z');
    mockDownload.mockImplementation(async (url: string, dest: { uri: string; name: string; size: number | null }) => {
      dest.size = 80_000;
      return dest;
    });

    const uri = await cache.ensureAudioCached(rerecorded);

    expect(mockDownload).toHaveBeenCalledWith(
      'https://cdn.test/audio/wg1/v1-2000.m4a?_=2026-10-13T00:00:00Z',
      expect.anything()
    );
    expect(uri).toContain('v1-2000');
    // iOS picks a decoder from the extension — the cached file must keep it.
    expect(uri).toMatch(/\.m4a$/);
  });

  it('a "successful" download that is really a tiny error body is discarded and the remote URL streamed', async () => {
    mockDownload.mockImplementation(async (_url: string, dest: { size: number | null }) => {
      dest.size = 187;
      return dest;
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const uri = await cache.ensureAudioCached(variant('wg1/v1-2000.m4a'));

    expect(uri).toBe('https://cdn.test/audio/wg1/v1-2000.m4a?_=2026-10-13T00:00:00Z');
  });

  it('download fails but the file is reachable → streams the remote URL', async () => {
    mockDownload.mockRejectedValue(new Error('disk full'));
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await expect(cache.ensureAudioCached(variant('wg1/v1-2000.m4a'))).resolves.toMatch(/^https:\/\//);
  });

  it('offline with nothing cached → null (UI shows retry, not a dead play button)', async () => {
    mockDownload.mockRejectedValue(new Error('offline'));
    mockFetch.mockRejectedValue(new Error('offline'));

    await expect(cache.ensureAudioCached(variant('wg1/v1-2000.m4a'))).resolves.toBeNull();
  });

  it('the recording was deleted from Storage (404) → null', async () => {
    mockDownload.mockRejectedValue(new Error('404'));
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    await expect(cache.ensureAudioCached(variant('wg1/v1-2000.m4a'))).resolves.toBeNull();
  });
});

describe('ensureAudioCached on web', () => {
  const cache = loadAudioCache('web');

  it('streams the versioned remote URL (no local cache) once it is reachable', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const uri = await cache.ensureAudioCached(variant('wg1/v1-2000.m4a'));

    expect(uri).toBe('https://cdn.test/audio/wg1/v1-2000.m4a?_=2026-10-13T00:00:00Z');
    expect(mockFetch).toHaveBeenCalledWith(uri, { method: 'HEAD' });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('a re-recording produces a different URL, so the browser cannot serve the old audio', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const before = await cache.ensureAudioCached(variant('wg1/v1-1000.m4a', '2026-10-01T00:00:00Z'));
    const after = await cache.ensureAudioCached(variant('wg1/v1-2000.m4a', '2026-10-13T00:00:00Z'));

    expect(after).not.toBe(before);
  });

  it('unreachable file → null', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });
    await expect(cache.ensureAudioCached(variant('wg1/v1-2000.m4a'))).resolves.toBeNull();
  });
});
