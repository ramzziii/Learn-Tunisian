// The two listening formats, rendered for real with mocked audio:
// - "See the meaning → choose the recording": every option has its own play
//   button that never selects it, and a separate Choose button;
// - "Listen → choose the meaning": the native clip plays, the options are
//   meanings.
// Both: one answer per question (so spaced repetition is fed once), gentle
// wrong-answer feedback that plays the correct clip and reveals the word,
// correctness shown in words as well as colour, and no device/AI speech.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';
import type { ExerciseItem } from '@/types/exercises';

const mockEnsureAudioCached = jest.fn();
const mockSpeak = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn(), pause: jest.fn() };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/lib/offline/audioCache', () => ({
  ensureAudioCached: (...args: unknown[]) => mockEnsureAudioCached(...args),
}));
jest.mock('expo-speech', () => ({ speak: (...args: unknown[]) => mockSpeak(...args), stop: jest.fn() }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false, didJustFinish: false }),
}));
jest.mock('@/hooks/useAnswerFeedback', () => ({ useAnswerFeedback: () => ({ playCorrect: jest.fn(), playIncorrect: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ListenChooseRecording } = require('@/components/exercises/adult/ListenChooseRecording');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ListenChooseMeaning } = require('@/components/exercises/adult/ListenChooseMeaning');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const target = makeGroup('t', { englishMeaning: 'thank you', variants: [makeVariant('t', { listenable: true, wordArabic: 'يعيشك', transliteration: 'y3aychek' })] });
const others = ['b', 'c', 'd'].map((id) => makeGroup(id, { listenable: true, englishMeaning: `meaning ${id}` }));

const recordingQuestion = (): ExerciseItem => ({
  key: 'q1',
  type: 'listen_recording',
  targetGroup: target,
  promptVariant: target.variants[0],
  // Target is option 2.
  options: [others[0], target, others[1], others[2]].map((group) => ({ group, variant: group.variants[0] })),
});

const meaningQuestion = (): ExerciseItem => ({
  key: 'q2',
  type: 'listen_meaning',
  targetGroup: target,
  promptVariant: target.variants[0],
  options: [others[0], target, others[1], others[2]].map((group) => ({ group, variant: group.variants[0] })),
});

const renderThemed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => {
  mockEnsureAudioCached.mockReset().mockImplementation(async (v: { audioPath: string }) => `file:///cache/${v.audioPath}`);
  mockSpeak.mockReset();
  Object.values(mockPlayer).forEach((fn) => fn.mockClear());
});

describe('see the meaning → choose the recording', () => {
  it('shows the meaning and 4 recordings, without giving away their words before answering', async () => {
    await renderThemed(<ListenChooseRecording exercise={recordingQuestion()} onComplete={jest.fn()} />);

    expect(screen.getByText(/thank you/)).toBeOnTheScreen();
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByRole('button', { name: `Play recording ${i} of 4` })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: `Choose recording ${i} of 4` })).toBeOnTheScreen();
    }
    expect(screen.queryByText('يعيشك')).toBeNull();
    expect(screen.queryByText('y3aychek')).toBeNull();
  });

  it('play buttons only play — they never select an answer', async () => {
    const onComplete = jest.fn();
    await renderThemed(<ListenChooseRecording exercise={recordingQuestion()} onComplete={onComplete} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Play recording 1 of 4' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play recording 3 of 4' }));

    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: `file:///cache/${others[1].variants[0].audioPath}` });
    expect(screen.queryByText('Great job!')).toBeNull();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('choosing the right recording: positive feedback, said in words, then one result', async () => {
    const onComplete = jest.fn();
    await renderThemed(<ListenChooseRecording exercise={recordingQuestion()} onComplete={onComplete} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Choose recording 2 of 4' }));

    expect(screen.getByText('Great job!')).toBeOnTheScreen();
    expect(screen.getByText('✓ Right answer')).toBeOnTheScreen();
    expect(screen.getAllByText('يعيشك').length).toBeGreaterThan(0); // revealed after answering

    await fireEvent.press(screen.getByText('Next'));
    await fireEvent.press(screen.getByText('Next'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('a wrong choice: gentle feedback, the correct clip plays, the word is revealed, one result', async () => {
    const onComplete = jest.fn();
    await renderThemed(<ListenChooseRecording exercise={recordingQuestion()} onComplete={onComplete} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Choose recording 4 of 4' }));

    expect(screen.getByText('Not quite')).toBeOnTheScreen();
    expect(screen.getByText('✗ Your choice')).toBeOnTheScreen();
    expect(screen.getByText('✓ Right answer')).toBeOnTheScreen();
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: `file:///cache/${target.variants[0].audioPath}` });
    expect(screen.getAllByText('يعيشك').length).toBeGreaterThan(0);

    // Changing your mind after answering does nothing.
    await fireEvent.press(screen.getByRole('button', { name: 'Choose recording 2 of 4' }));
    await fireEvent.press(screen.getByText('Next'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('replaying recordings after answering is still allowed and records nothing more', async () => {
    const onComplete = jest.fn();
    await renderThemed(<ListenChooseRecording exercise={recordingQuestion()} onComplete={onComplete} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose recording 2 of 4' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play recording 1 of 4' }));
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: `file:///cache/${others[0].variants[0].audioPath}` });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('offline with a clip not downloaded: that option says so and offers a retry — no device voice', async () => {
    mockEnsureAudioCached.mockImplementation(async (v: { audioPath: string }) =>
      v.audioPath === others[0].variants[0].audioPath ? null : `file:///cache/${v.audioPath}`
    );
    await renderThemed(<ListenChooseRecording exercise={recordingQuestion()} onComplete={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Play recording 1 of 4' }));

    expect(screen.getByText(/couldn.t load this recording/i)).toBeOnTheScreen();
    const retry = screen.getByRole('button', { name: 'Retry recording 1 of 4' });
    expect(mockSpeak).not.toHaveBeenCalled();

    mockEnsureAudioCached.mockResolvedValueOnce('file:///cache/now-online.m4a');
    await fireEvent.press(retry);
    expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'file:///cache/now-online.m4a' });
  });
});

describe('listen → choose the meaning', () => {
  it('plays the native clip on its own and offers meanings to choose from', async () => {
    await renderThemed(<ListenChooseMeaning exercise={meaningQuestion()} onComplete={jest.fn()} />);
    await screen.findByText('thank you');

    expect(mockEnsureAudioCached).toHaveBeenCalledWith(target.variants[0]);
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: `file:///cache/${target.variants[0].audioPath}` });
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeOnTheScreen();
    for (const meaning of ['thank you', 'meaning b', 'meaning c', 'meaning d']) {
      expect(screen.getByRole('button', { name: `Choose “${meaning}”` })).toBeOnTheScreen();
    }
  });

  it('a wrong meaning: gentle feedback, the clip plays again, the word is revealed, one result', async () => {
    const onComplete = jest.fn();
    await renderThemed(<ListenChooseMeaning exercise={meaningQuestion()} onComplete={onComplete} />);
    await screen.findByText('thank you');
    const playsBefore = mockPlayer.play.mock.calls.length;

    await fireEvent.press(screen.getByRole('button', { name: 'Choose “meaning c”' }));

    expect(screen.getByText('Not quite')).toBeOnTheScreen();
    expect(screen.getByText('✗ Your choice')).toBeOnTheScreen();
    expect(mockPlayer.play.mock.calls.length).toBeGreaterThan(playsBefore);
    expect(screen.getByText('يعيشك')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Choose “thank you”' }));
    await fireEvent.press(screen.getByText('Next'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('the right meaning → one correct result', async () => {
    const onComplete = jest.fn();
    await renderThemed(<ListenChooseMeaning exercise={meaningQuestion()} onComplete={onComplete} />);
    await screen.findByText('thank you');
    await fireEvent.press(screen.getByRole('button', { name: 'Choose “thank you”' }));
    expect(screen.getByText('✓ Right answer')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Next'));
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('offline with the clip not downloaded: a retry, never the device voice', async () => {
    mockEnsureAudioCached.mockResolvedValue(null);
    await renderThemed(<ListenChooseMeaning exercise={meaningQuestion()} onComplete={jest.fn()} />);

    expect(await screen.findByRole('button', { name: 'Retry loading audio' })).toBeOnTheScreen();
    expect(screen.getByText(/couldn.t load this recording/i)).toBeOnTheScreen();
    expect(mockSpeak).not.toHaveBeenCalled();
  });
});
