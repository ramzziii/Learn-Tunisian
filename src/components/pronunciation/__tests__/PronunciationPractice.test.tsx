// The one record → check → compare flow used everywhere a learner records.
// The automatic check is the app's existing one (talk-stt transcription +
// isAnyVariantSpeechMatch); when it can't run, the learner self-assesses.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockDeletedUris: string[] = [];
const mockTranscribe = jest.fn();
let mockPermission = 'granted';
let mockScoringAvailable = true;
let mockRecorderListener: ((status: Record<string, unknown>) => void) | undefined;
const mockRecorder = {
  uri: 'file:///cache/take.m4a' as string | null,
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
};
const mockOwnPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };
const mockNativePlay = jest.fn();
const mockUseWordAudioPlayer = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ status: mockPermission })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setAudioModeAsync: jest.fn(async () => undefined),
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: (_opts: unknown, listener?: (status: Record<string, unknown>) => void) => {
    mockRecorderListener = listener;
    return mockRecorder;
  },
  useAudioRecorderState: () => ({ durationMillis: 1200 }),
  useAudioPlayer: () => mockOwnPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return true;
    }
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
    delete() {
      mockDeletedUris.push(this.uri);
    }
  },
}));
jest.mock('@/lib/ai', () => ({
  get isUsingMockAiProvider() {
    return !mockScoringAvailable;
  },
}));
jest.mock('@/lib/ai/functionsClient', () => ({ transcribeAudio: (...a: unknown[]) => mockTranscribe(...a) }));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: (...args: unknown[]) => mockUseWordAudioPlayer(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PronunciationPractice, PRONUNCIATION_MAX_ATTEMPTS, REVISIT_AUTO_ADVANCE_MS } = require(
  '@/components/pronunciation/PronunciationPractice'
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const native = { id: 'v1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: 'g1/v1.m4a' };
const matchGroup = { id: 'g1', variants: [native] };

async function renderPractice(props: Record<string, unknown> = {}) {
  const onFinish = jest.fn();
  const view = await render(
    <ThemeProvider>
      <PronunciationPractice nativeVariant={native} matchGroup={matchGroup} maxAttempts={3} onFinish={onFinish} {...props} />
    </ThemeProvider>
  );
  return { onFinish, view };
}

async function recordOnce() {
  await fireEvent.press(await screen.findByLabelText('Start recording'));
  await fireEvent.press(await screen.findByLabelText('Stop recording'));
}

/** "Try again" starts the next recording by itself — the learner just stops it. */
async function tryAgainAndRecord() {
  await fireEvent.press(await screen.findByText('Try again'));
  await fireEvent.press(await screen.findByLabelText('Stop recording'));
}

beforeEach(() => {
  mockDeletedUris.length = 0;
  mockPermission = 'granted';
  mockScoringAvailable = true;
  mockRecorder.uri = 'file:///cache/take.m4a';
  mockRecorder.stop.mockReset().mockResolvedValue(undefined);
  mockTranscribe.mockReset();
  mockOwnPlayer.replace.mockClear();
  mockOwnPlayer.play.mockClear();
  mockNativePlay.mockClear();
  mockUseWordAudioPlayer.mockReset().mockReturnValue({
    play: mockNativePlay,
    hasAudio: true,
    isResolving: false,
    hasError: false,
    isFallbackVoice: false,
    isPlaying: false,
    retry: jest.fn(),
  });
});

it('three tries everywhere', () => {
  expect(PRONUNCIATION_MAX_ATTEMPTS).toBe(3);
});

it('plays the native recording first, honouring whether the generated-voice fallback is allowed', async () => {
  await renderPractice({ allowFallbackVoice: false });
  expect(mockUseWordAudioPlayer).toHaveBeenCalledWith(native, { autoPlay: true, fallbackVoice: false });
});

describe('automatic check (the existing transcription check)', () => {
  it('a match: a "Great job" pop-up with just Next — no compare buttons when it was right', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'عسلامة' });
    const { onFinish } = await renderPractice();

    await recordOnce();

    expect(await screen.findByText(/Great job/)).toBeOnTheScreen();
    expect(mockTranscribe).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'audio/m4a');
    expect(screen.queryByText('▶ Your voice')).toBeNull();
    expect(screen.queryByText('▶ Native')).toBeNull();
    expect(screen.getByTestId('feedback-countdown')).toHaveTextContent('3');

    await fireEvent.press(screen.getByText('Next'));
    expect(onFinish).toHaveBeenCalledWith({ correct: true, attempts: 1 });
  });

  it('a miss lets them play their recording and the native one to compare', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    await renderPractice();

    await recordOnce();
    await fireEvent.press(await screen.findByText('▶ Your voice'));
    expect(mockOwnPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/take.m4a' });
    await fireEvent.press(screen.getByText('▶ Native'));
    expect(mockNativePlay).toHaveBeenCalled();
  });

  it('no match: "Not quite right yet", compare both, then Try again or Move on', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    const { onFinish } = await renderPractice();

    await recordOnce();

    expect(await screen.findByText(/Not quite right yet/)).toBeOnTheScreen();
    expect(screen.getByText('▶ Your voice')).toBeOnTheScreen();
    expect(screen.getByText('▶ Native')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Move on'));
    expect(onFinish).toHaveBeenCalledWith({ correct: false, attempts: 1 });
  });

  it('Try again goes straight into recording (no extra tap) and counts the attempt', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    const { onFinish } = await renderPractice();

    await recordOnce();
    expect(screen.getByText('Try 1 of 3')).toBeOnTheScreen();
    mockRecorder.record.mockClear();
    await fireEvent.press(await screen.findByText('Try again'));

    expect(await screen.findByLabelText('Stop recording')).toBeOnTheScreen();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Attempt 2 of 3')).toBeOnTheScreen();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('Try again with the microphone off goes back to the say-it-aloud choice instead', async () => {
    mockPermission = 'denied';
    await renderPractice();

    await fireEvent.press(await screen.findByText('Not yet'));
    await fireEvent.press(await screen.findByText('Try again'));

    expect(await screen.findByText(/Microphone is off/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
  });

  it('third miss: says it will be revisited later and moves on by itself', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    const { onFinish } = await renderPractice();

    await recordOnce();
    await tryAgainAndRecord();
    await tryAgainAndRecord();

    expect(await screen.findByText(/revisit this one later/)).toBeOnTheScreen();
    expect(screen.queryByText('Try again')).toBeNull();
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith({ correct: false, attempts: 3 }), {
      timeout: REVISIT_AUTO_ADVANCE_MS + 2000,
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  }, 20000);

  it('third miss: listening to compare pauses the auto-advance until they tap Continue', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    const { onFinish } = await renderPractice({ maxAttempts: 1 });

    await recordOnce();
    await fireEvent.press(await screen.findByText('▶ Native'));
    await new Promise((r) => setTimeout(r, REVISIT_AUTO_ADVANCE_MS + 300));

    expect(onFinish).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Next'));
    expect(onFinish).toHaveBeenCalledWith({ correct: false, attempts: 1 });
  }, 20000);

  it('a custom message for the end-of-session revisit pass', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    await renderPractice({ maxAttempts: 1, outOfTriesMessage: 'Good effort — it’ll come up again in your reviews.' });

    await recordOnce();

    expect(await screen.findByText(/come up again in your reviews/)).toBeOnTheScreen();
  });
});

describe('when the automatic check cannot run → the learner decides', () => {
  it('check failed (offline / service error): asks them, with both recordings to compare', async () => {
    mockTranscribe.mockResolvedValue({ ok: false, error: { kind: 'network', message: 'offline' } });
    const { onFinish } = await renderPractice();

    await recordOnce();

    expect(await screen.findByText(/Couldn.t check automatically/)).toBeOnTheScreen();
    expect(screen.getByText('▶ Native')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('I got it'));
    expect(await screen.findByText(/Great job/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));
    expect(onFinish).toHaveBeenCalledWith({ correct: true, attempts: 1 });
  });

  it('checking turned off (mock mode): never calls the service, asks them instead', async () => {
    mockScoringAvailable = false;
    await renderPractice();

    await recordOnce();
    await fireEvent.press(await screen.findByText('Not yet'));

    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(await screen.findByText(/Not quite right yet/)).toBeOnTheScreen();
    expect(screen.getByText('Move on')).toBeOnTheScreen();
  });

  it('microphone off: they can still listen, say it aloud, and assess themselves', async () => {
    mockPermission = 'denied';
    const { onFinish } = await renderPractice();

    expect(await screen.findByText(/Microphone is off/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Start recording')).toBeNull();
    await fireEvent.press(screen.getByText('I got it'));
    await fireEvent.press(await screen.findByText('Next'));
    expect(onFinish).toHaveBeenCalledWith({ correct: true, attempts: 1 });
  });
});

describe('recording problems', () => {
  it("a recording that didn't save: explains, doesn't count an attempt", async () => {
    mockRecorder.uri = null;
    await renderPractice();

    await recordOnce();

    expect(await screen.findByText(/didn.t save/)).toBeOnTheScreen();
    expect(screen.getByText('Attempt 1 of 3')).toBeOnTheScreen();
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('an interrupted recording: explains and lets them record again', async () => {
    await renderPractice();

    await fireEvent.press(await screen.findByLabelText('Start recording'));
    await act(async () => mockRecorderListener?.({ hasError: true, error: 'interrupted' }));

    expect(await screen.findByText(/interrupted/i)).toBeOnTheScreen();
    expect(screen.getByLabelText('Start recording')).toBeOnTheScreen();
  });
});

describe("the learner's audio is not kept", () => {
  it('deleted once they move on', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'عسلامة' });
    await renderPractice();

    await recordOnce();
    await fireEvent.press(await screen.findByText('Next'));

    expect(mockDeletedUris).toEqual(['file:///cache/take.m4a']);
  });

  it('deleted when they try again', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'شيء آخر' });
    await renderPractice();

    await recordOnce();
    await fireEvent.press(await screen.findByText('Try again'));

    expect(mockDeletedUris).toEqual(['file:///cache/take.m4a']);
  });

  it('deleted if they leave mid-way', async () => {
    mockTranscribe.mockResolvedValue({ ok: true, text: 'عسلامة' });
    const { view } = await renderPractice();

    await recordOnce();
    await screen.findByText(/Great job/);
    await act(async () => view.unmount());

    expect(mockDeletedUris).toEqual(['file:///cache/take.m4a']);
  });
});
