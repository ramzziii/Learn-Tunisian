// The Native Recordings station's optional explanation recording: an
// "Add explanation recording" box (ticked by default), its own record/upload
// take kept apart from the pronunciation, and an explanation-only mode for
// adding explanations to existing content.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSave = jest.fn();
const mockSaveExplanation = jest.fn();
const mockPick = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };
let mockTakes: string[] = [];
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
jest.mock('@/data/admin/recordingQueue', () => ({
  saveQueueRecording: (...a: unknown[]) => mockSave(...a),
  saveQueueExplanation: (...a: unknown[]) => mockSaveExplanation(...a),
}));
jest.mock('@/lib/admin/audioFile', () => ({ pickAudioFile: (...a: unknown[]) => mockPick(...a) }));
jest.mock('@/hooks/useAdminAudioRecorder', () => ({
  useAdminAudioRecorder: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useState } = require('react');
    const [isRecording, setIsRecording] = useState(false);
    return {
      permission: mockPermission,
      isRecording,
      durationMillis: 3000,
      requestPermission: jest.fn(),
      start: async () => setIsRecording(true),
      stop: async () => {
        setIsRecording(false);
        return mockTakes.shift() ?? null;
      },
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RecordingStation } = require('@/components/admin/RecordingStation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const baseVariant = {
  id: 'v1',
  wordGroupId: 'g1',
  variantLabel: 'primary',
  wordArabic: 'عسلامة',
  transliteration: '3aslema',
  audioPath: null,
  explanationAudioPath: null,
};
const itemWith = (variant: Record<string, unknown> = {}) => ({
  variant: { ...baseVariant, ...variant },
  englishMeaning: 'hello',
  unitName: 'Greetings',
  lessonNumber: 1,
  reason: 'no_audio',
});

async function renderStation(props: Record<string, unknown> = {}) {
  const handlers = { onSaved: jest.fn(), onSkip: jest.fn() };
  await render(
    <ThemeProvider>
      <RecordingStation item={itemWith()} actorAccountId="admin-1" {...handlers} {...props} />
    </ThemeProvider>
  );
  return handlers;
}

const explanationBox = () => screen.getByRole('checkbox', { name: /explanation recording/i });

async function recordPronunciation() {
  await fireEvent.press(screen.getByText('● Record'));
  await fireEvent.press(await screen.findByText(/■ Stop/));
}

beforeEach(() => {
  mockTakes = ['file:///take.m4a', 'file:///explain.m4a'];
  mockPermission = 'ready';
  mockSave.mockReset().mockResolvedValue({ id: 'v1' });
  mockSaveExplanation.mockReset().mockResolvedValue({ id: 'v1' });
  mockPick.mockReset();
  mockPlayer.replace.mockClear();
  mockPlayer.play.mockClear();
});

describe('pronunciation + optional explanation', () => {
  it('flags that the word has no explanation yet', async () => {
    await renderStation();
    expect(screen.getByText('No explanation yet')).toBeOnTheScreen();
  });

  it('"Add explanation recording" is ticked by default once there is a pronunciation take', async () => {
    await renderStation();
    await recordPronunciation();

    expect(explanationBox().props.accessibilityLabel).toBe('Add explanation recording');
    expect(explanationBox().props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('● Record explanation')).toBeOnTheScreen();
    expect(screen.getByText('Upload explanation')).toBeOnTheScreen();
  });

  it('ticked but no explanation yet: Save & next explains what’s missing and saves nothing', async () => {
    await renderStation();
    await recordPronunciation();

    await fireEvent.press(screen.getByText('Save & next'));

    expect(await screen.findByText(/Record or upload the explanation, or untick/)).toBeOnTheScreen();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('unticked: saves the pronunciation alone', async () => {
    const { onSaved } = await renderStation();
    await recordPronunciation();

    await fireEvent.press(explanationBox());
    expect(screen.queryByText('● Record explanation')).toBeNull();
    await fireEvent.press(screen.getByText('Save & next'));

    expect(mockSave).toHaveBeenCalledWith({ item: itemWith(), localUri: 'file:///take.m4a', addToRepeatAfterMe: true, actorAccountId: 'admin-1' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('records the explanation as a separate take, plays each one back separately, and saves both', async () => {
    const { onSaved } = await renderStation();
    await recordPronunciation();

    await fireEvent.press(screen.getByText('● Record explanation'));
    await fireEvent.press(await screen.findByText(/■ Stop explanation/));

    await fireEvent.press(screen.getByText('▶ Play recording'));
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'file:///take.m4a' });
    await fireEvent.press(screen.getByText('▶ Play explanation'));
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'file:///explain.m4a' });

    await fireEvent.press(screen.getByText('Save & next'));
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ localUri: 'file:///take.m4a', explanation: { localUri: 'file:///explain.m4a' } })
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('the explanation can be uploaded instead of recorded (no microphone needed)', async () => {
    mockPick.mockResolvedValue({
      kind: 'picked',
      file: { uri: 'file:///cache/explain.mp3', name: 'explain.mp3', format: { extension: 'mp3', contentType: 'audio/mpeg' } },
    });
    await renderStation();
    await recordPronunciation();

    await fireEvent.press(screen.getByText('Upload explanation'));
    expect(await screen.findByText(/explain\.mp3/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Save & next'));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        explanation: { localUri: 'file:///cache/explain.mp3', format: { extension: 'mp3', contentType: 'audio/mpeg' } },
      })
    );
  });

  it('cancelling the explanation picker changes nothing; an unsupported file says why', async () => {
    mockPick.mockResolvedValueOnce({ kind: 'canceled' }).mockResolvedValueOnce({ kind: 'invalid', message: 'That file type isn’t supported.' });
    await renderStation();
    await recordPronunciation();

    await fireEvent.press(screen.getByText('Upload explanation'));
    expect(screen.queryByText('▶ Play explanation')).toBeNull();
    await fireEvent.press(screen.getByText('Upload explanation'));
    expect(await screen.findByText(/isn.t supported/)).toBeOnTheScreen();
  });

  it('"Redo explanation" drops only the explanation take — the pronunciation take stays', async () => {
    await renderStation();
    await recordPronunciation();
    await fireEvent.press(screen.getByText('● Record explanation'));
    await fireEvent.press(await screen.findByText(/■ Stop explanation/));

    await fireEvent.press(screen.getByText('Redo explanation'));

    expect(screen.queryByText('▶ Play explanation')).toBeNull();
    expect(screen.getByText('▶ Play recording')).toBeOnTheScreen();
  });

  it('a failed save shows the error, keeps both takes, and can be retried', async () => {
    mockSave.mockRejectedValueOnce(new Error('Couldn’t upload the explanation recording (blocked).')).mockResolvedValueOnce({ id: 'v1' });
    const { onSaved } = await renderStation();
    await recordPronunciation();
    await fireEvent.press(screen.getByText('● Record explanation'));
    await fireEvent.press(await screen.findByText(/■ Stop explanation/));

    await fireEvent.press(screen.getByText('Save & next'));
    expect(await screen.findByText(/explanation recording \(blocked\)/)).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText('▶ Play explanation')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Save & next'));
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalled();
  });

  it('a word that already has an explanation keeps it unless "Replace explanation recording" is ticked', async () => {
    await renderStation({ item: itemWith({ explanationAudioPath: 'g1/v1-explanation-1.m4a' }) });
    expect(screen.queryByText('No explanation yet')).toBeNull();
    await recordPronunciation();

    expect(explanationBox().props.accessibilityLabel).toBe('Replace explanation recording');
    expect(explanationBox().props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByText('Save & next'));
    expect(mockSave).toHaveBeenCalledWith(expect.not.objectContaining({ explanation: expect.anything() }));
  });
});

describe('explanation-only mode (adding an explanation to existing content)', () => {
  const existing = itemWith({ audioPath: 'g1/v1-1.m4a' });

  it('plays the existing pronunciation, records only an explanation, and saves just that', async () => {
    mockTakes = ['file:///explain.m4a'];
    const { onSaved } = await renderStation({ item: existing, mode: 'explanation' });

    expect(screen.queryByText('● Record')).toBeNull();
    await fireEvent.press(screen.getByText('▶ Play pronunciation'));
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'https://cdn/g1/v1-1.m4a' });

    await fireEvent.press(screen.getByText('● Record explanation'));
    await fireEvent.press(await screen.findByText(/■ Stop explanation/));
    await fireEvent.press(screen.getByText('Save explanation & next'));

    expect(mockSaveExplanation).toHaveBeenCalledWith({ item: existing, localUri: 'file:///explain.m4a', actorAccountId: 'admin-1' });
    expect(mockSave).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('a failed explanation save stays on the word with the error', async () => {
    mockTakes = ['file:///explain.m4a'];
    mockSaveExplanation.mockRejectedValue(new Error('Upload was blocked'));
    const { onSaved } = await renderStation({ item: existing, mode: 'explanation' });

    await fireEvent.press(screen.getByText('● Record explanation'));
    await fireEvent.press(await screen.findByText(/■ Stop explanation/));
    await fireEvent.press(screen.getByText('Save explanation & next'));

    expect(await screen.findByText(/Upload was blocked/)).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('microphone denied: upload still works', async () => {
    mockPermission = 'denied';
    mockPick.mockResolvedValue({
      kind: 'picked',
      file: { uri: 'file:///cache/explain.m4a', name: 'explain.m4a', format: { extension: 'm4a', contentType: 'audio/mp4' } },
    });
    await renderStation({ item: existing, mode: 'explanation' });

    expect(screen.queryByText('● Record explanation')).toBeNull();
    await fireEvent.press(screen.getByText('Upload explanation'));
    await fireEvent.press(screen.getByText('Save explanation & next'));

    expect(mockSaveExplanation).toHaveBeenCalledWith(
      expect.objectContaining({ localUri: 'file:///cache/explain.m4a', format: { extension: 'm4a', contentType: 'audio/mp4' } })
    );
  });
});
