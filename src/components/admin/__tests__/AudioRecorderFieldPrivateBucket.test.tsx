// The same recorder/uploader, pointed at the private translation-audio
// bucket: uploads land there, and the saved audio previews through a signed
// URL (a public URL would 400 for a private bucket).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AudioRecorderField } from '@/components/admin/AudioRecorderField';
import { ThemeProvider } from '@/lib/theme/ThemeContext';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockBuckets: string[] = [];
const mockPlayerSources: unknown[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: true, error: null })),
    storage: {
      from: (bucket: string) => {
        mockBuckets.push(bucket);
        return { upload: mockUpload, remove: mockRemove, createSignedUrl: mockCreateSignedUrl };
      },
    },
  },
  getAudioUrl: (path: string | null) => (path ? `https://cdn.test/audio/${path}` : null),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
  Directory: class {},
  Paths: { cache: '/cache' },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: (source: unknown) => {
    mockPlayerSources.push(source);
    return { seekTo: jest.fn(async () => undefined), play: jest.fn() };
  },
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/hooks/useAdminAudioRecorder', () => ({
  useAdminAudioRecorder: () => ({
    permission: 'ready',
    isRecording: true,
    durationMillis: 2000,
    requestPermission: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(async () => 'file:///recordings/answer.m4a'),
  }),
}));
jest.mock('@/lib/admin/audioFile', () => ({ pickAudioFile: jest.fn() }));

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockRemove.mockReset().mockResolvedValue({ error: null });
  mockCreateSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: 'https://signed/req-1/answer-1.m4a' }, error: null });
  mockBuckets.length = 0;
  mockPlayerSources.length = 0;
});

async function renderField(onUploaded = jest.fn(async (p: string) => p)) {
  await render(
    <ThemeProvider>
      <AudioRecorderField
        wordGroupId="req-1"
        variantId="answer"
        currentAudioPath="req-1/answer-1.m4a"
        updatedAt="2026-10-01T00:00:00Z"
        onUploaded={onUploaded}
        audioBucket="translation-audio"
      />
    </ThemeProvider>
  );
  return onUploaded;
}

it('previews the saved private audio through a signed URL, never the public one', async () => {
  await renderField();

  await waitFor(() => expect(mockCreateSignedUrl).toHaveBeenCalledWith('req-1/answer-1.m4a', 3600));
  await waitFor(() => expect(mockPlayerSources).toContainEqual({ uri: 'https://signed/req-1/answer-1.m4a' }));
  expect(mockPlayerSources).not.toContainEqual({ uri: expect.stringContaining('cdn.test') });
});

it('saves a new recording into the private bucket, replacing the old file only after it is persisted', async () => {
  const onUploaded = await renderField();

  await fireEvent.press(await screen.findByText('Stop (2s)'));
  await fireEvent.press(await screen.findByText('Save Recording'));

  expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
  expect(onUploaded.mock.calls[0][0]).toMatch(/^req-1\/answer-\d+\.m4a$/);
  expect(mockBuckets.filter((b) => b !== 'translation-audio')).toEqual([]);
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(['req-1/answer-1.m4a']));
  await act(async () => {});
});
