// What the admin actually sees when saving a recording. Uses the real
// saveRecordedWordVariantAudio + uploadWordVariantAudio; only the device
// recorder/player and the Supabase client are faked.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AudioRecorderField } from '@/components/admin/AudioRecorderField';
import { ThemeProvider } from '@/lib/theme/ThemeContext';

const mockUpload = jest.fn();
const mockRemove = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: true, error: null })),
    storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
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
  useAudioPlayer: () => ({ seekTo: jest.fn(async () => undefined), play: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
}));

// A recorder that is already mid-recording: pressing "Stop" yields a file.
jest.mock('@/hooks/useAdminAudioRecorder', () => ({
  useAdminAudioRecorder: () => ({
    permission: 'ready',
    isRecording: true,
    durationMillis: 2000,
    requestPermission: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(async () => 'file:///recordings/take-2.m4a'),
  }),
}));

const PREVIOUS_PATH = 'wg1/v1-1000.m4a';

async function renderField(onUploaded: (path: string) => Promise<string | null>) {
  return await render(
    <ThemeProvider>
      <AudioRecorderField
        wordGroupId="wg1"
        variantId="v1"
        currentAudioPath={PREVIOUS_PATH}
        updatedAt="2026-10-01T00:00:00Z"
        onUploaded={onUploaded}
      />
    </ThemeProvider>
  );
}

async function recordAndSave() {
  fireEvent.press(await screen.findByText('Stop (2s)'));
  fireEvent.press(await screen.findByText('Save Recording'));
}

beforeEach(() => {
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockRemove.mockReset().mockResolvedValue({ error: null });
});

it('when saving the new path to the database fails: shows the error, never "saved", keeps the old file, allows retry', async () => {
  const onUploaded = jest.fn().mockRejectedValue(new Error('permission denied for table word_variants'));
  await renderField(onUploaded);

  await recordAndSave();

  expect(await screen.findByText(/previous recording was kept/i)).toBeOnTheScreen();
  expect(screen.queryByText('Audio saved successfully.')).toBeNull();
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockRemove).not.toHaveBeenCalled();
  // The take isn't thrown away — the admin can retry without re-recording.
  expect(screen.getByText('Save Recording')).toBeOnTheScreen();
  expect(screen.queryByText(/^Current: wg1\/v1-\d+\.m4a$/)).toBeNull();
});

it('when the upload itself fails: shows the error and never touches the database or the old file', async () => {
  mockUpload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
  const onUploaded = jest.fn();
  await renderField(onUploaded);

  await recordAndSave();

  expect(await screen.findByText(/session may have expired/i)).toBeOnTheScreen();
  expect(onUploaded).not.toHaveBeenCalled();
  expect(mockRemove).not.toHaveBeenCalled();
});

it('on success: confirms, shows the new path, and only then deletes the previous file', async () => {
  const onUploaded = jest.fn(async (path: string) => path);
  await renderField(onUploaded);

  await recordAndSave();

  expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
  const savedPath = onUploaded.mock.calls[0][0];
  expect(savedPath).toMatch(/^wg1\/v1-\d+\.m4a$/);
  expect(screen.getByText(`Current: ${savedPath}`)).toBeOnTheScreen();
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith([PREVIOUS_PATH]));
  await act(async () => {});
});
