// One Repeat After Me item: hear the admin's recording, record yourself,
// play it back, then say whether you got it. Covers permissions, failed and
// interrupted recordings, and that the learner's audio isn't kept.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockDeletedUris: string[] = [];
let mockPermission = 'granted';
let mockRecorderListener: ((status: Record<string, unknown>) => void) | undefined;
const mockRecorder = {
  uri: 'file:///cache/recording-1.m4a' as string | null,
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
};
const mockOwnPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };
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
    delete() {
      mockDeletedUris.push(this.uri);
    }
  },
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: (...args: unknown[]) => mockUseWordAudioPlayer(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RepeatAfterMeExercise } = require('@/components/repeatAfterMe/RepeatAfterMeExercise');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = {
  id: 'v1',
  wordGroupId: 'g1',
  englishMeaning: 'hello',
  variant: { id: 'v1', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: 'g1/v1-1000.m4a' },
};

async function renderExercise(props: Record<string, unknown> = {}) {
  const handlers = { onAssess: jest.fn(), onContinue: jest.fn() };
  const view = await render(
    <ThemeProvider>
      <RepeatAfterMeExercise item={item} attemptsUsed={0} maxAttempts={3} isReview={false} notice={null} {...handlers} {...props} />
    </ThemeProvider>
  );
  return { ...handlers, view };
}

async function recordOnce() {
  await fireEvent.press(await screen.findByLabelText('Start recording'));
  await fireEvent.press(await screen.findByLabelText('Stop recording'));
}

beforeEach(() => {
  mockDeletedUris.length = 0;
  mockPermission = 'granted';
  mockRecorder.uri = 'file:///cache/recording-1.m4a';
  mockRecorder.stop.mockReset().mockResolvedValue(undefined);
  mockRecorder.prepareToRecordAsync.mockClear();
  mockOwnPlayer.replace.mockClear();
  mockOwnPlayer.play.mockClear();
  mockUseWordAudioPlayer.mockReset().mockReturnValue({
    play: jest.fn(),
    hasAudio: true,
    isResolving: false,
    hasError: false,
    isFallbackVoice: false,
    isPlaying: false,
    retry: jest.fn(),
  });
});

it("plays the admin's own recording — never the generated-voice fallback", async () => {
  await renderExercise();

  expect(mockUseWordAudioPlayer).toHaveBeenCalledWith(item.variant, { autoPlay: true, fallbackVoice: false });
  expect(await screen.findByText('hello')).toBeOnTheScreen();
});

it('self-assessment only appears once the learner has recorded and can compare', async () => {
  const { onAssess } = await renderExercise();

  expect(screen.queryByText('I got it')).toBeNull();
  await recordOnce();

  await fireEvent.press(await screen.findByText('Play my recording'));
  expect(mockOwnPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/recording-1.m4a' });
  expect(mockOwnPlayer.play).toHaveBeenCalled();

  await fireEvent.press(screen.getByText('I got it'));
  expect(onAssess).toHaveBeenCalledWith(true);
});

it('"Not yet" reports the attempt as not right', async () => {
  const { onAssess } = await renderExercise();
  await recordOnce();
  await fireEvent.press(await screen.findByText('Not yet'));
  expect(onAssess).toHaveBeenCalledWith(false);
});

it('shows which attempt this is, out of three', async () => {
  await renderExercise({ attemptsUsed: 1 });
  expect(await screen.findByText('Attempt 2 of 3')).toBeOnTheScreen();
});

it("deletes the learner's recording once they've assessed it — no learner audio is kept", async () => {
  await renderExercise();
  await recordOnce();
  await fireEvent.press(await screen.findByText('Not yet'));

  expect(mockDeletedUris).toEqual(['file:///cache/recording-1.m4a']);
});

it('deletes an unassessed recording when the learner leaves the item', async () => {
  const { view } = await renderExercise();
  await recordOnce();
  await act(async () => view.unmount());

  expect(mockDeletedUris).toEqual(['file:///cache/recording-1.m4a']);
});

it("a recording that didn't save: explains, doesn't count an attempt, lets them record again", async () => {
  mockRecorder.uri = null;
  const { onAssess } = await renderExercise();

  await recordOnce();

  expect(await screen.findByText(/didn.t save/)).toBeOnTheScreen();
  expect(screen.queryByText('I got it')).toBeNull();
  expect(screen.getByLabelText('Start recording')).toBeOnTheScreen();
  expect(onAssess).not.toHaveBeenCalled();
});

it('an interrupted recording (e.g. a call): explains, discards it, lets them record again', async () => {
  const { onAssess } = await renderExercise();

  await fireEvent.press(await screen.findByLabelText('Start recording'));
  await act(async () => mockRecorderListener?.({ hasError: true, error: 'interrupted', isFinished: false }));

  expect(await screen.findByText(/interrupted/i)).toBeOnTheScreen();
  expect(screen.getByLabelText('Start recording')).toBeOnTheScreen();
  expect(onAssess).not.toHaveBeenCalled();
});

it('microphone denied: they can still listen, say it aloud, and assess themselves', async () => {
  mockPermission = 'denied';
  const { onAssess } = await renderExercise();

  expect(await screen.findByText(/Microphone is off/)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Start recording')).toBeNull();
  await fireEvent.press(screen.getByText('I got it'));
  expect(onAssess).toHaveBeenCalledWith(true);
});

it('microphone not yet allowed: explains first, then asks', async () => {
  mockPermission = 'undetermined';
  await renderExercise();

  await fireEvent.press(await screen.findByText('Allow microphone access'));

  expect(await screen.findByLabelText('Start recording')).toBeOnTheScreen();
});

it("the admin's recording failed to load: offers a retry instead of a silent button", async () => {
  mockUseWordAudioPlayer.mockReturnValue({
    play: jest.fn(),
    hasAudio: false,
    isResolving: false,
    hasError: true,
    isFallbackVoice: false,
    isPlaying: false,
    retry: jest.fn(),
  });
  await renderExercise();

  expect(await screen.findByLabelText('Retry loading audio')).toBeOnTheScreen();
});

it('after three misses: says it will be revisited later, then continues', async () => {
  const { onContinue } = await renderExercise({ attemptsUsed: 3, notice: 'missed' });

  expect(await screen.findByText(/revisit this one later/)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Start recording')).toBeNull();
  await fireEvent.press(screen.getByText('Continue'));
  expect(onContinue).toHaveBeenCalled();
});

it('in the review pass it is clearly a single extra try', async () => {
  await renderExercise({ isReview: true, attemptsUsed: 3 });
  expect(await screen.findByText('Review — one more try')).toBeOnTheScreen();
});
