// Admin Native Recordings + Skipped Recordings screens.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockFetchQueue = jest.fn();
const mockFetchSkipped = jest.fn();
const mockSkip = jest.fn();
const mockRestore = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'admin-1' } } }) }));
jest.mock('@/data/admin/recordingQueue', () => ({
  fetchRecordingQueue: (...a: unknown[]) => mockFetchQueue(...a),
  fetchSkippedRecordings: (...a: unknown[]) => mockFetchSkipped(...a),
  skipRecording: (...a: unknown[]) => mockSkip(...a),
  restoreSkippedRecording: (...a: unknown[]) => mockRestore(...a),
}));
// The station itself is tested on its own; this stub exposes its callbacks.
jest.mock('@/components/admin/RecordingStation', () => ({
  RecordingStation: (props: { item: { variant: { id: string } }; onSaved: (v: unknown) => void; onSkip?: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text, Pressable } = require('react-native');
    return (
      <>
        <Text>{`Recording ${props.item.variant.id}${props.onSkip ? '' : ' (no skip)'}`}</Text>
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
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = (id: string) => ({
  variant: { id, wordGroupId: 'g1', variantLabel: 'primary', wordArabic: `ar-${id}`, transliteration: `tr-${id}`, audioPath: null },
  englishMeaning: `meaning ${id}`,
  unitName: 'Basics',
  lessonNumber: 1,
  reason: 'no_audio',
});

beforeEach(() => {
  [mockFetchQueue, mockFetchSkipped, mockSkip, mockRestore].forEach((m) => m.mockReset());
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
