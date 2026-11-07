// Admin Native Recordings + Skipped Recordings screens.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockFetchQueue = jest.fn();
const mockFetchSkipped = jest.fn();
const mockSkip = jest.fn();
const mockRestore = jest.fn();
const mockFetchMissingExplanations = jest.fn();
const mockPush = jest.fn();
// Screens' focus effects; refocus() runs them again (coming back from the editor).
const mockFocusEffects = new Set<() => void>();
const refocus = () => act(async () => mockFocusEffects.forEach((effect) => effect()));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), canGoBack: () => true },
  useFocusEffect: (effect: () => void) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('react').useEffect(() => {
      mockFocusEffects.add(effect);
      effect();
      return () => void mockFocusEffects.delete(effect);
    }, [effect]),
}));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'admin-1' } } }) }));
const mockFetchRecheck = jest.fn();
const mockConfirm = jest.fn();
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, isPlaying: false, source: 'native' }),
}));
jest.mock('@/data/admin/recordingQueue', () => ({
  fetchRecheckQueue: (...a: unknown[]) => mockFetchRecheck(...a),
  confirmAudioMatches: (...a: unknown[]) => mockConfirm(...a),
  confirmErrorMessage: (e: Error) => `refused: ${e.message}`,
  fetchRecordingQueue: (...a: unknown[]) => mockFetchQueue(...a),
  fetchSkippedRecordings: (...a: unknown[]) => mockFetchSkipped(...a),
  skipRecording: (...a: unknown[]) => mockSkip(...a),
  restoreSkippedRecording: (...a: unknown[]) => mockRestore(...a),
  fetchMissingExplanations: (...a: unknown[]) => mockFetchMissingExplanations(...a),
}));
// The station itself is tested on its own; this stub exposes its callbacks.
jest.mock('@/components/admin/RecordingStation', () => ({
  RecordingStation: (props: {
    item: { variant: { id: string } };
    mode?: string;
    onSaved: (v: unknown) => void;
    onSkip?: () => void;
    onEdit?: () => void;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Recording ${props.item.variant.id}${props.onSkip ? '' : ' (no skip)'}${props.mode ? ` mode=${props.mode}` : ''}`}</Text>
        <Text>{`word: ${(props.item as unknown as { englishMeaning: string }).englishMeaning}`}</Text>
        {props.onEdit ? (
          <Pressable onPress={props.onEdit}>
            <Text>Stub edit</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => props.onSaved({ id: props.item.variant.id })}>
          <Text>Stub save</Text>
        </Pressable>
        {props.onSkip ? (
          <Pressable onPress={props.onSkip}>
            <Text>Stub skip</Text>
          </Pressable>
        ) : null}
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Recordings = require('../../../app/admin/recordings').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SkippedRecordings = require('../../../app/admin/recordings-skipped').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MissingExplanations = require('../../../app/admin/recordings-explanations').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = (id: string) => ({
  variant: { id, wordGroupId: 'g1', variantLabel: 'primary', wordArabic: `ar-${id}`, transliteration: `tr-${id}`, audioPath: null },
  englishMeaning: `meaning ${id}`,
  unitName: 'Basics',
  lessonNumber: 1,
  reason: 'no_audio',
});

beforeEach(() => {
  [mockFetchQueue, mockFetchSkipped, mockSkip, mockRestore, mockFetchMissingExplanations, mockPush].forEach((m) => m.mockReset());
  mockSkip.mockResolvedValue({});
  mockRestore.mockResolvedValue({});
});

describe('Native Recordings', () => {
  it('lists every word form that needs a native voice, with a count', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b'), item('c')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    expect(await screen.findByText('3 words need a native voice')).toBeOnTheScreen();
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
    expect(screen.getByText('meaning c')).toBeOnTheScreen();
  });

  it('tap a word to record it; after saving, the next word pops up', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b'), item('c')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning b'));
    expect(screen.getByText('Recording b')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Stub save'));
    expect(await screen.findByText('Recording c')).toBeOnTheScreen();
    expect(screen.getByText('2 left')).toBeOnTheScreen();
  });

  it('after the last word in the list it wraps to any word still left', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning b'));
    await fireEvent.press(screen.getByText('Stub save'));

    expect(await screen.findByText('Recording a')).toBeOnTheScreen();
  });

  it('Edit word opens the word editor; coming back shows the edited word, still on its card', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );
    await fireEvent.press(await screen.findByText('meaning b'));
    await fireEvent.press(screen.getByText('Stub edit'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/word-groups/[wordGroupId]', params: { wordGroupId: 'g1' } });

    mockFetchQueue.mockResolvedValue([item('a'), { ...item('b'), englishMeaning: 'edited b' }]);
    await refocus();
    expect(await screen.findByText('word: edited b')).toBeOnTheScreen();
    expect(screen.getByText('Recording b')).toBeOnTheScreen();
    expect(mockFetchQueue).toHaveBeenCalledTimes(2);
  });

  it('coming back to the screen without editing reloads nothing', async () => {
    mockFetchQueue.mockResolvedValue([item('a')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );
    await screen.findByText('meaning a');
    await refocus();
    expect(mockFetchQueue).toHaveBeenCalledTimes(1);
  });

  it('Skip skips permanently (saved, by this admin) and moves to the next word', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning a'));
    await fireEvent.press(screen.getByText('Stub skip'));

    expect(mockSkip).toHaveBeenCalledWith('a', 'admin-1');
    expect(await screen.findByText('Recording b')).toBeOnTheScreen();
  });

  it('a skip that fails to save shows the error and stays on the word', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b')]);
    mockSkip.mockRejectedValue(new Error('permission denied'));
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning a'));
    await fireEvent.press(screen.getByText('Stub skip'));

    expect(await screen.findByText(/Couldn.t skip.*permission denied/)).toBeOnTheScreen();
    expect(screen.getByText('Recording a')).toBeOnTheScreen();
  });

  it('when every word is done: a clear finished state', async () => {
    mockFetchQueue.mockResolvedValue([item('a')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning a'));
    await fireEvent.press(screen.getByText('Stub save'));

    expect(await screen.findByText(/Every word has a native voice/)).toBeOnTheScreen();
  });

  it('back to the list from a word', async () => {
    mockFetchQueue.mockResolvedValue([item('a'), item('b')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning a'));
    await fireEvent.press(screen.getByText('‹ All words'));

    expect(screen.getByText('2 words need a native voice')).toBeOnTheScreen();
  });

  it('load failure: error with retry', async () => {
    mockFetchQueue.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([item('a')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('Try again'));

    expect(await screen.findByText('1 word needs a native voice')).toBeOnTheScreen();
  });
});

describe('Re-check (spelling changed after recording)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Recheck = require('../../../app/admin/recordings-recheck').default;
  const recheck = (id: string) => ({ ...item(id), reason: 'needs_recheck' });
  const renderRecheck = () =>
    render(
      <ThemeProvider>
        <Recheck />
      </ThemeProvider>
    );

  beforeEach(() => {
    mockFetchRecheck.mockReset().mockResolvedValue([recheck('a'), recheck('b')]);
    mockConfirm.mockReset().mockResolvedValue(undefined);
  });

  it('lists each one with Listen, "Still matches" and "Record a new one"', async () => {
    await renderRecheck();
    expect(await screen.findByText('meaning a')).toBeOnTheScreen();
    expect(screen.getByText(/Learners don.t hear them until you check/)).toBeOnTheScreen();
    expect(screen.getAllByText('✓ Still matches')).toHaveLength(2);
    expect(screen.getByLabelText('Listen to the recording of meaning a')).toBeOnTheScreen();
  });

  it('"Still matches" confirms it (the database clears the flag) and takes it off the list', async () => {
    await renderRecheck();
    await fireEvent.press((await screen.findAllByText('✓ Still matches'))[0]);
    expect(mockConfirm).toHaveBeenCalledWith('a');
    expect(await screen.findByText('meaning b')).toBeOnTheScreen();
    expect(screen.queryByText('meaning a')).toBeNull();
  });

  it('a refusal is shown in plain words and the item stays', async () => {
    mockConfirm.mockRejectedValue(new Error('permission denied'));
    await renderRecheck();
    await fireEvent.press((await screen.findAllByText('✓ Still matches'))[0]);
    expect(await screen.findByText('refused: permission denied')).toBeOnTheScreen();
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
  });

  it('"Record a new one" opens the recording station for that form', async () => {
    await renderRecheck();
    await fireEvent.press((await screen.findAllByText('Record a new one'))[1]);
    expect(screen.getByText('Recording b (no skip)')).toBeOnTheScreen();
  });

  it('nothing flagged: says so', async () => {
    mockFetchRecheck.mockResolvedValue([]);
    await renderRecheck();
    expect(await screen.findByText('Nothing to re-check')).toBeOnTheScreen();
  });
});

describe('Skipped Recordings', () => {
  it('lists skipped words; recording one has no Skip, and moves on to the next skipped word', async () => {
    mockFetchSkipped.mockResolvedValue([item('s1'), item('s2')]);
    await render(
      <ThemeProvider>
        <SkippedRecordings />
      </ThemeProvider>
    );

    expect(await screen.findByText('2 skipped words without a recording')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Record')[0]);
    expect(screen.getByText('Recording s1 (no skip)')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Stub save'));
    expect(await screen.findByText('Recording s2 (no skip)')).toBeOnTheScreen();
  });

  it('"Put back" returns a word to the Native Recordings list', async () => {
    mockFetchSkipped.mockResolvedValue([item('s1'), item('s2')]);
    await render(
      <ThemeProvider>
        <SkippedRecordings />
      </ThemeProvider>
    );

    await fireEvent.press((await screen.findAllByText('Put back'))[0]);

    expect(mockRestore).toHaveBeenCalledWith('s1', 'admin-1');
    expect(await screen.findByText('1 skipped word without a recording')).toBeOnTheScreen();
  });

  it('nothing skipped → empty state', async () => {
    mockFetchSkipped.mockResolvedValue([]);
    await render(
      <ThemeProvider>
        <SkippedRecordings />
      </ThemeProvider>
    );
    expect(await screen.findByText(/No skipped words/)).toBeOnTheScreen();
  });
});

describe('Missing Explanations', () => {
  const recorded = (id: string) => ({ ...item(id), variant: { ...item(id).variant, audioPath: `g1/${id}.m4a`, explanationAudioPath: null } });

  it('is linked from Native Recordings', async () => {
    mockFetchQueue.mockResolvedValue([item('a')]);
    await render(
      <ThemeProvider>
        <Recordings />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('Missing explanations ›'));
    expect(mockPush).toHaveBeenCalledWith('/admin/recordings-explanations');
  });

  it('lists recorded words with no explanation, flagged as such, with a count', async () => {
    mockFetchMissingExplanations.mockResolvedValue([recorded('a'), recorded('b')]);
    await render(
      <ThemeProvider>
        <MissingExplanations />
      </ThemeProvider>
    );

    expect(await screen.findByText(/2 words have no explanation recording yet/)).toBeOnTheScreen();
    expect(screen.getByText('meaning a')).toBeOnTheScreen();
    expect(screen.getAllByText('No explanation').length).toBe(2);
  });

  it('opens a word in explanation-only mode; after saving, the next one comes up; Skip just moves on', async () => {
    mockFetchMissingExplanations.mockResolvedValue([recorded('a'), recorded('b'), recorded('c')]);
    await render(
      <ThemeProvider>
        <MissingExplanations />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('meaning a'));
    expect(screen.getByText('Recording a mode=explanation')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Stub save'));
    expect(await screen.findByText('Recording b mode=explanation')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Stub skip'));
    expect(await screen.findByText('Recording c mode=explanation')).toBeOnTheScreen();
    expect(mockSkip).not.toHaveBeenCalled(); // not a permanent skip
  });

  it('all done: a clear finished state', async () => {
    mockFetchMissingExplanations.mockResolvedValue([]);
    await render(
      <ThemeProvider>
        <MissingExplanations />
      </ThemeProvider>
    );
    expect(await screen.findByText(/Every recorded word has an explanation/)).toBeOnTheScreen();
  });

  it('load failure: error with retry', async () => {
    mockFetchMissingExplanations.mockRejectedValueOnce(new Error('network')).mockResolvedValue([recorded('a')]);
    await render(
      <ThemeProvider>
        <MissingExplanations />
      </ThemeProvider>
    );

    await fireEvent.press(await screen.findByText('Try again'));
    expect(await screen.findByText('meaning a')).toBeOnTheScreen();
  });
});
