// "Upload audio" in the admin content editor's recorder field: choose a file,
// preview it, save it through the same safe upload → persist → delete-old
// sequence as a recording. Uses the real saveRecordedWordVariantAudio; the
// picker, recorder, player and Supabase client are faked.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AudioRecorderField } from '@/components/admin/AudioRecorderField';
import { ThemeProvider } from '@/lib/theme/ThemeContext';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockPick = jest.fn();
const mockRequestPermission = jest.fn();
const mockPlay = jest.fn();
const mockPlayerSources: unknown[] = [];
let mockPermission = 'ready';

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
  useAudioPlayer: (source: unknown) => {
    mockPlayerSources.push(source);
    return { seekTo: jest.fn(async () => undefined), play: mockPlay };
  },
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/hooks/useAdminAudioRecorder', () => ({
  useAdminAudioRecorder: () => ({
    permission: mockPermission,
    isRecording: false,
    durationMillis: 0,
    requestPermission: mockRequestPermission,
    start: jest.fn(),
    stop: jest.fn(),
  }),
}));
jest.mock('@/lib/admin/audioFile', () => ({ pickAudioFile: (...a: unknown[]) => mockPick(...a) }));

const PREVIOUS_PATH = 'wg1/v1-1000.m4a';
const MP3 = { uri: 'file:///cache/ahla.mp3', name: 'ahla.mp3', format: { extension: 'mp3', contentType: 'audio/mpeg' } };

async function renderField(
  onUploaded: (path: string) => Promise<string | null> = async (p) => p,
  repeatAfterMe?: { isIncluded: boolean; onDecide: (include: boolean) => Promise<void> }
) {
  await render(
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

async function pickAndSave() {
  await fireEvent.press(screen.getByText('Upload audio'));
  await fireEvent.press(await screen.findByText('Save uploaded audio'));
}

beforeEach(() => {
  mockPermission = 'ready';
  mockUpload.mockReset().mockResolvedValue({ error: null });
  mockRemove.mockReset().mockResolvedValue({ error: null });
  mockPick.mockReset().mockResolvedValue({ kind: 'picked', file: MP3 });
  mockRequestPermission.mockReset();
  mockPlay.mockReset();
  mockPlayerSources.length = 0;
});

it('offers Upload audio next to Record', async () => {
  await renderField();
  expect(screen.getByText('Record')).toBeOnTheScreen();
  expect(screen.getByText('Upload audio')).toBeOnTheScreen();
});

it('a picked file can be previewed before saving, and nothing is saved yet', async () => {
  await renderField();

  await fireEvent.press(screen.getByText('Upload audio'));

  expect(await screen.findByText(/ahla\.mp3 — preview, then save/)).toBeOnTheScreen();
  expect(mockPlayerSources[mockPlayerSources.length - 1]).toEqual({ uri: 'file:///cache/ahla.mp3' });
  await fireEvent.press(screen.getByText('▶ Preview'));
  expect(mockPlay).toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
});

it('cancelling the picker changes nothing and shows no error', async () => {
  mockPick.mockResolvedValue({ kind: 'canceled' });
  await renderField();

  await fireEvent.press(screen.getByText('Upload audio'));

  expect(screen.getByText(`Current: ${PREVIOUS_PATH}`)).toBeOnTheScreen();
  expect(screen.queryByText('Save uploaded audio')).toBeNull();
  expect(screen.queryByText(/couldn|not supported|error/i)).toBeNull();
});

it('an unsupported file shows why, and keeps the current audio', async () => {
  mockPick.mockResolvedValue({ kind: 'invalid', message: 'That file type isn’t supported — choose an MP3, M4A, AAC or WAV file.' });
  await renderField();

  await fireEvent.press(screen.getByText('Upload audio'));

  expect(await screen.findByText(/MP3, M4A, AAC or WAV/)).toBeOnTheScreen();
  expect(screen.getByText(`Current: ${PREVIOUS_PATH}`)).toBeOnTheScreen();
  expect(screen.queryByText('Save uploaded audio')).toBeNull();
});

it('saving uploads it in its own format, persists the path, confirms, then deletes the old file', async () => {
  const onUploaded = jest.fn(async (path: string) => path);
  await renderField(onUploaded);

  await pickAndSave();

  expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
  const savedPath = onUploaded.mock.calls[0][0];
  expect(savedPath).toMatch(/^wg1\/v1-\d+\.mp3$/);
  expect(mockUpload).toHaveBeenCalledWith(savedPath, expect.any(Uint8Array), { contentType: 'audio/mpeg', upsert: true });
  expect(screen.getByText(`Current: ${savedPath}`)).toBeOnTheScreen();
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith([PREVIOUS_PATH]));
  await act(async () => {});
});

it('a failed upload shows the error, never touches the database or old file, and can be retried', async () => {
  mockUpload.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
  const onUploaded = jest.fn(async (path: string) => path);
  await renderField(onUploaded);

  await pickAndSave();

  expect(await screen.findByText(/session may have expired/i)).toBeOnTheScreen();
  expect(onUploaded).not.toHaveBeenCalled();
  expect(mockRemove).not.toHaveBeenCalled();
  expect(screen.queryByText('Audio saved successfully.')).toBeNull();

  await fireEvent.press(screen.getByText('Save uploaded audio'));
  expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
  expect(mockPick).toHaveBeenCalledTimes(1); // retried without re-picking
  await act(async () => {});
});

it('a failed database update keeps the old audio (and its file), and offers retry', async () => {
  const onUploaded = jest.fn().mockRejectedValue(new Error('permission denied for table word_variants'));
  await renderField(onUploaded);

  await pickAndSave();

  expect(await screen.findByText(/previous recording was kept/i)).toBeOnTheScreen();
  expect(screen.queryByText('Audio saved successfully.')).toBeNull();
  expect(mockRemove).not.toHaveBeenCalled();
  expect(screen.getByText('Save uploaded audio')).toBeOnTheScreen();
});

describe('Repeat After Me after an uploaded file is saved', () => {
  it('asks only after the save succeeds; accepting persists and confirms', async () => {
    const onDecide = jest.fn(async () => undefined);
    await renderField(async (p) => p, { isIncluded: false, onDecide });

    await pickAndSave();
    expect(await screen.findByText('Add this recording to Repeat After Me?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add to Repeat After Me'));

    expect(onDecide).toHaveBeenCalledWith(true);
    expect(await screen.findByText(/Added to Repeat After Me/)).toBeOnTheScreen();
  });

  it('a failed choice shows the error and can be retried', async () => {
    const onDecide = jest.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(undefined);
    await renderField(async (p) => p, { isIncluded: false, onDecide });

    await pickAndSave();
    await fireEvent.press(await screen.findByText('Add to Repeat After Me'));
    expect(await screen.findByText(/Couldn.t update Repeat After Me.*network down/)).toBeOnTheScreen();
    expect(screen.queryByText(/Added to Repeat After Me/)).toBeNull();

    await fireEvent.press(screen.getByText('Add to Repeat After Me'));
    expect(await screen.findByText(/Added to Repeat After Me/)).toBeOnTheScreen();
  });

  it('is never asked when the upload failed', async () => {
    // Supabase's StorageError is an Error subclass.
    mockUpload.mockResolvedValue({ error: new Error('boom') });
    await renderField(async (p) => p, { isIncluded: false, onDecide: jest.fn() });

    await pickAndSave();

    expect(await screen.findByText(/boom/)).toBeOnTheScreen();
    expect(screen.queryByText('Add this recording to Repeat After Me?')).toBeNull();
  });
});

describe('microphone permission denied', () => {
  beforeEach(() => {
    mockPermission = 'denied';
  });

  it('still offers upload and preview, and explains how to enable recording', async () => {
    await renderField();

    expect(screen.getByText(/enable it in device settings to record/i)).toBeOnTheScreen();
    expect(screen.getByText('Upload audio')).toBeOnTheScreen();
    expect(screen.getByText('▶ Preview')).toBeOnTheScreen();
    expect(screen.queryByText('Record')).toBeNull();
  });

  it('uploading works end to end without ever asking for the microphone', async () => {
    const onUploaded = jest.fn(async (path: string) => path);
    await renderField(onUploaded);

    await pickAndSave();

    expect(await screen.findByText('Audio saved successfully.')).toBeOnTheScreen();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    await act(async () => {});
  });
});
