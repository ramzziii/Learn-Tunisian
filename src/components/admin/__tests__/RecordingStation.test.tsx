// One word in the admin Native Recordings flow: record, listen back,
// re-record, choose Repeat After Me (ticked by default), save or skip.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSave = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };

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
jest.mock('@/hooks/useAdminAudioRecorder', () => ({
  useAdminAudioRecorder: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useState } = require('react');
    const [isRecording, setIsRecording] = useState(false);
    return {
      permission: 'ready',
      isRecording,
      durationMillis: 1500,
      requestPermission: jest.fn(),
      start: async () => setIsRecording(true),
      stop: async () => {
        setIsRecording(false);
        return 'file:///take.m4a';
      },
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RecordingStation } = require('@/components/admin/RecordingStation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = {
  variant: { id: 'v1', wordGroupId: 'g1', variantLabel: 'also_heard', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: null, explanationAudioPath: 'g1/v1-explanation-1.m4a' },
  englishMeaning: 'hello',
  unitName: 'Greetings',
  lessonNumber: 1,
  reason: 'no_audio',
};

async function renderStation(props: Record<string, unknown> = {}) {
  const handlers = { onSaved: jest.fn(), onSkip: jest.fn() };
  await render(
    <ThemeProvider>
      <RecordingStation item={item} actorAccountId="admin-1" {...handlers} {...props} />
    </ThemeProvider>
  );
  return handlers;
}

async function recordOnce() {
  await fireEvent.press(screen.getByText('● Record'));
  await fireEvent.press(await screen.findByText(/■ Stop/));
}

beforeEach(() => {
  mockSave.mockReset();
  mockPlayer.replace.mockClear();
  mockPlayer.play.mockClear();
});

it('shows the word being recorded: meaning, Arabic, transliteration, form, and why it is listed', async () => {
  await renderStation();

  expect(screen.getByText('hello')).toBeOnTheScreen();
  expect(screen.getByText('عسلامة')).toBeOnTheScreen();
  expect(screen.getByText('3aslema')).toBeOnTheScreen();
  expect(screen.getByText(/Also heard/)).toBeOnTheScreen();
  expect(screen.getByText(/No recording yet/)).toBeOnTheScreen();
});

it('Save only appears once there is a recording to save', async () => {
  await renderStation();
  expect(screen.queryByText('Save & next')).toBeNull();

  await recordOnce();

  expect(screen.getByText('Save & next')).toBeOnTheScreen();
});

it('listen back to the take, or record it again', async () => {
  await renderStation();
  await recordOnce();

  await fireEvent.press(screen.getByText('▶ Play recording'));
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///take.m4a' });
  expect(mockPlayer.play).toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Record again'));
  expect(screen.queryByText('Save & next')).toBeNull();
  expect(screen.getByText('● Record')).toBeOnTheScreen();
});

it('"Add to Repeat After Me" is ticked by default, and can be unticked', async () => {
  await renderStation();
  await recordOnce();

  const box = screen.getByRole('checkbox', { name: 'Add to Repeat After Me' });
  expect(box.props.accessibilityState).toMatchObject({ checked: true });
  await fireEvent.press(box);
  expect(screen.getByRole('checkbox', { name: 'Add to Repeat After Me' }).props.accessibilityState).toMatchObject({ checked: false });
});

it('Save & next saves with the box’s choice, then hands back the saved form', async () => {
  const saved = { id: 'v1', audioPath: 'g1/v1-2000.m4a', isNativeVoice: true, inRepeatAfterMe: true };
  mockSave.mockResolvedValue(saved);
  const { onSaved } = await renderStation();

  await recordOnce();
  await fireEvent.press(screen.getByText('Save & next'));

  expect(mockSave).toHaveBeenCalledWith({ item, localUri: 'file:///take.m4a', addToRepeatAfterMe: true, actorAccountId: 'admin-1' });
  expect(onSaved).toHaveBeenCalledWith(saved);
});

it('unticked → saved without Repeat After Me', async () => {
  mockSave.mockResolvedValue({ id: 'v1' });
  await renderStation();

  await recordOnce();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Add to Repeat After Me' }));
  await fireEvent.press(screen.getByText('Save & next'));

  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ addToRepeatAfterMe: false }));
});

it('a failed save shows the error and stays on this word', async () => {
  mockSave.mockRejectedValue(new Error('Upload was blocked by Supabase Storage permissions'));
  const { onSaved } = await renderStation();

  await recordOnce();
  await fireEvent.press(screen.getByText('Save & next'));

  expect(await screen.findByText(/blocked by Supabase Storage permissions/)).toBeOnTheScreen();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByText('Save & next')).toBeOnTheScreen();
});

it('Skip hands the decision back to the screen', async () => {
  const { onSkip } = await renderStation();
  await fireEvent.press(screen.getByText('Skip'));
  expect(onSkip).toHaveBeenCalled();
});

it('no Skip where skipping makes no sense (already-skipped list)', async () => {
  await renderStation({ onSkip: undefined });
  expect(screen.queryByText('Skip')).toBeNull();
});
