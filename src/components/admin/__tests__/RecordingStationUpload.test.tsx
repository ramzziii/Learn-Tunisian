// "Upload audio" in the admin Native Recordings queue: choose a file instead
// of recording, preview it, then Save & next through the same queue save.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSave = jest.fn();
const mockPick = jest.fn();
const mockRequestPermission = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };
let mockPermission = 'ready';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/lib/supabase/client', () => ({ getAudioUrl: (p: string | null) => (p ? `https://cdn/${p}` : null) }));
jest.mock('@/data/admin/recordingQueue', () => ({ saveQueueRecording: (...a: unknown[]) => mockSave(...a) }));
jest.mock('@/lib/admin/audioFile', () => ({ pickAudioFile: (...a: unknown[]) => mockPick(...a) }));
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RecordingStation } = require('@/components/admin/RecordingStation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = {
  variant: { id: 'v1', wordGroupId: 'g1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: 'g1/old.m4a', explanationAudioPath: 'g1/v1-explanation-1.m4a' },
  englishMeaning: 'hello',
  unitName: 'Greetings',
  lessonNumber: 1,
  reason: 'not_native',
};
const MP3 = { uri: 'file:///cache/ahla.mp3', name: 'ahla.mp3', format: { extension: 'mp3', contentType: 'audio/mpeg' } };

async function renderStation() {
  const handlers = { onSaved: jest.fn(), onSkip: jest.fn() };
  await render(
    <ThemeProvider>
      <RecordingStation item={item} actorAccountId="admin-1" {...handlers} />
    </ThemeProvider>
  );
  return handlers;
}

beforeEach(() => {
  mockPermission = 'ready';
  mockSave.mockReset();
  mockPick.mockReset().mockResolvedValue({ kind: 'picked', file: MP3 });
  mockRequestPermission.mockReset();
  mockPlayer.replace.mockClear();
  mockPlayer.play.mockClear();
});

it('offers Upload audio alongside Record', async () => {
  await renderStation();
  expect(screen.getByText('● Record')).toBeOnTheScreen();
  expect(screen.getByText('Upload audio')).toBeOnTheScreen();
});

it('a picked file can be played back, with the Repeat After Me box ticked, before saving', async () => {
  await renderStation();

  await fireEvent.press(screen.getByText('Upload audio'));

  expect(await screen.findByText(/ahla\.mp3/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('▶ Play file'));
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/ahla.mp3' });
  expect(mockPlayer.play).toHaveBeenCalled();
  expect(screen.getByRole('checkbox', { name: 'Add to Repeat After Me' }).props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(mockSave).not.toHaveBeenCalled();
});

it('Save & next saves the file in its own format, with the box’s choice', async () => {
  const saved = { id: 'v1', audioPath: 'g1/v1-2000.mp3' };
  mockSave.mockResolvedValue(saved);
  const { onSaved } = await renderStation();

  await fireEvent.press(screen.getByText('Upload audio'));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Add to Repeat After Me' }));
  await fireEvent.press(screen.getByText('Save & next'));

  expect(mockSave).toHaveBeenCalledWith({
    item,
    localUri: 'file:///cache/ahla.mp3',
    format: { extension: 'mp3', contentType: 'audio/mpeg' },
    addToRepeatAfterMe: false,
    actorAccountId: 'admin-1',
  });
  expect(onSaved).toHaveBeenCalledWith(saved);
});

it('a failed save shows the error, stays on the word, and can be retried with the same file', async () => {
  mockSave.mockRejectedValueOnce(new Error('Audio uploaded, but saving it to this variant failed')).mockResolvedValueOnce({ id: 'v1' });
  const { onSaved } = await renderStation();

  await fireEvent.press(screen.getByText('Upload audio'));
  await fireEvent.press(screen.getByText('Save & next'));

  expect(await screen.findByText(/saving it to this variant failed/)).toBeOnTheScreen();
  expect(onSaved).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Save & next'));
  expect(onSaved).toHaveBeenCalled();
  expect(mockPick).toHaveBeenCalledTimes(1);
});

it('cancelling the picker changes nothing and shows no error', async () => {
  mockPick.mockResolvedValue({ kind: 'canceled' });
  await renderStation();

  await fireEvent.press(screen.getByText('Upload audio'));

  expect(screen.queryByText('Save & next')).toBeNull();
  expect(screen.getByText('● Record')).toBeOnTheScreen();
  expect(screen.queryByText(/couldn|supported/i)).toBeNull();
});

it('an unsupported file shows why and nothing is ready to save', async () => {
  mockPick.mockResolvedValue({ kind: 'invalid', message: 'That file type isn’t supported — choose an MP3, M4A, AAC or WAV file.' });
  await renderStation();

  await fireEvent.press(screen.getByText('Upload audio'));

  expect(await screen.findByText(/MP3, M4A, AAC or WAV/)).toBeOnTheScreen();
  expect(screen.queryByText('Save & next')).toBeNull();
});

it('"Choose another file" drops the picked file', async () => {
  await renderStation();

  await fireEvent.press(screen.getByText('Upload audio'));
  await fireEvent.press(screen.getByText('Choose another file'));

  expect(screen.queryByText('Save & next')).toBeNull();
  expect(screen.getByText('Upload audio')).toBeOnTheScreen();
});

it('microphone denied: explains how to enable recording, but upload still works without asking for it', async () => {
  mockPermission = 'denied';
  mockSave.mockResolvedValue({ id: 'v1' });
  const { onSaved } = await renderStation();

  expect(screen.getByText(/Microphone access is off/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Upload audio'));
  await fireEvent.press(screen.getByText('Save & next'));

  expect(onSaved).toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
});
