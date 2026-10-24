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

async function renderField(
  onUploaded: (path: string) => Promise<string | null>,
  repeatAfterMe?: { isIncluded: boolean; onDecide: (include: boolean) => Promise<void> }
) {
  return await render(
    <ThemeProvider>
      <AudioRecorderField
        wordGroupId="wg1"
        variantId="v1"
        currentAudioPath={PREVIOUS_PATH}
        updatedAt="2026-10-01T00:00:00Z"
        onUploaded={onUploaded}
        repeatAfterMe={repeatAfterMe}
      />
    </ThemeProvider>
  );
}

async function recordAndSave() {
  await fireEvent.press(await screen.findByText('Stop (2s)'));
  await fireEvent.press(await screen.findByText('Save Recording'));
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

describe('Repeat After Me opt-in after a successful recording', () => {
  const savedPath = async (path: string) => path;

  it('asks whether to add the new recording to Repeat After Me — only after the save succeeded', async () => {
    await renderField(savedPath, { isIncluded: false, onDecide: jest.fn() });

    await recordAndSave();

    expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
    expect(screen.getByText('Add this recording to Repeat After Me?')).toBeOnTheScreen();
  });

  it('accepting persists the opt-in and confirms only once that save succeeds', async () => {
    let resolveDecision: () => void = () => {};
    const onDecide = jest.fn(() => new Promise<void>((resolve) => (resolveDecision = resolve)));
    await renderField(savedPath, { isIncluded: false, onDecide });

    await recordAndSave();
    // Not awaited: the press only settles once the (held) save resolves.
    const pressing = fireEvent.press(await screen.findByText('Add to Repeat After Me'));

    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(true));
    expect(screen.queryByText(/Added to Repeat After Me/)).toBeNull(); // not before it's saved
    await act(async () => resolveDecision());
    await pressing;
    expect(await screen.findByText(/Added to Repeat After Me/)).toBeOnTheScreen();
    expect(screen.queryByText('Add this recording to Repeat After Me?')).toBeNull();
  });

  it('declining keeps it out of Repeat After Me', async () => {
    const onDecide = jest.fn(async () => undefined);
    await renderField(savedPath, { isIncluded: false, onDecide });

    await recordAndSave();
    await fireEvent.press(await screen.findByText('Not now'));

    expect(onDecide).toHaveBeenCalledWith(false);
    expect(await screen.findByText(/Not in Repeat After Me/)).toBeOnTheScreen();
  });

  it('declining a recording that was already included removes it, and says so', async () => {
    const onDecide = jest.fn(async () => undefined);
    await renderField(savedPath, { isIncluded: true, onDecide });

    await recordAndSave();
    await fireEvent.press(await screen.findByText('Remove from Repeat After Me'));

    expect(onDecide).toHaveBeenCalledWith(false);
    expect(await screen.findByText(/Removed from Repeat After Me/)).toBeOnTheScreen();
  });

  it('if saving the choice fails: shows the error, no success, and the question stays to retry', async () => {
    const onDecide = jest.fn().mockRejectedValue(new Error('permission denied for table word_variants'));
    await renderField(savedPath, { isIncluded: false, onDecide });

    await recordAndSave();
    await fireEvent.press(await screen.findByText('Add to Repeat After Me'));

    expect(await screen.findByText(/Couldn.t update Repeat After Me.*permission denied/)).toBeOnTheScreen();
    expect(screen.queryByText(/Added to Repeat After Me/)).toBeNull();
    expect(screen.getByText('Add to Repeat After Me')).toBeOnTheScreen();
  });

  it('never asks when the recording itself failed to save', async () => {
    const onDecide = jest.fn();
    await renderField(jest.fn().mockRejectedValue(new Error('permission denied')), { isIncluded: false, onDecide });

    await recordAndSave();

    expect(await screen.findByText(/previous recording was kept/i)).toBeOnTheScreen();
    expect(screen.queryByText('Add this recording to Repeat After Me?')).toBeNull();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('does not ask at all where the screen has not opted into the question', async () => {
    await renderField(savedPath);

    await recordAndSave();

    expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
    expect(screen.queryByText('Add this recording to Repeat After Me?')).toBeNull();
  });
});
