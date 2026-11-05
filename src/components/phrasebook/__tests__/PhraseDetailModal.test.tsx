// Phrasebook phrase pop-up: "Practice saying it" is the shared record →
// check → compare flow (tested in PronunciationPractice.test.tsx).
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPracticeProps = jest.fn();
let mockPracticeMounts = 0;

jest.mock('@/components/phraseWords/WordsUsedSection', () => ({
  WordsUsedSection: ({ phraseId }: { phraseId: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>{`[words used for ${phraseId}]`}</Text>;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
let mockAudio = { play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, source: 'native' as string | null, isPlaying: false, retry: jest.fn() };
const mockSpeak = jest.fn();
jest.mock('@/hooks/useWordAudioPlayer', () => ({ useWordAudioPlayer: () => mockAudio }));
jest.mock('expo-speech', () => ({ speak: (...a: unknown[]) => mockSpeak(...a), stop: jest.fn() }));
jest.mock('@/components/ui/ExplanationPlayButton', () => ({
  ExplanationPlayButton: ({ variant }: { variant: { explanationAudioPath?: string | null } }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return variant?.explanationAudioPath ? <Text>{`[explanation ${variant.explanationAudioPath}]`}</Text> : null;
  },
}));
jest.mock('@/components/pronunciation/PronunciationPractice', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    PRONUNCIATION_MAX_ATTEMPTS: 3,
    PronunciationPractice: (props: { onFinish: (r: { correct: boolean; attempts: number }) => void }) => {
      mockPracticeProps(props);
      React.useEffect(() => {
        mockPracticeMounts += 1;
      }, []);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Text, Pressable } = require('react-native');
      return (
        <Pressable onPress={() => props.onFinish({ correct: true, attempts: 1 })}>
          <Text>Finish practice</Text>
        </Pressable>
      );
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PhraseDetailModal } = require('@/components/phrasebook/PhraseDetailModal');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const variant = { id: 'v1', variantLabel: 'primary', wordArabic: 'عسلامة', transliteration: '3aslema', audioPath: 'g/v1.m4a', notes: null };
const phrase = { id: 'pb1', englishMeaning: 'hello', variants: [variant] };

async function renderModal() {
  const onClose = jest.fn();
  await render(
    <ThemeProvider>
      <PhraseDetailModal phrase={phrase} onClose={onClose} />
    </ThemeProvider>
  );
  return { onClose };
}

beforeEach(() => {
  mockPracticeProps.mockClear();
  mockPracticeMounts = 0;
  mockSpeak.mockClear();
  mockAudio = { play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, source: 'native', isPlaying: false, retry: jest.fn() };
});

describe('playing the phrase', () => {
  it('a native recording says so', async () => {
    await renderModal();
    expect(screen.getByText('🎙️ Native recording')).toBeOnTheScreen();
    expect(screen.queryByText('Computer voice — not a Tunisian speaker')).toBeNull();
  });

  it('the computer voice is labelled as not Tunisian and plays only when tapped', async () => {
    mockAudio = { ...mockAudio, source: 'computer' };
    await renderModal();
    expect(screen.getByText('Computer voice — not a Tunisian speaker')).toBeOnTheScreen();
    expect(mockAudio.play).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Play hello' }));
    expect(mockAudio.play).toHaveBeenCalled();
  });

  it('no recording: says so, and never uses the phone’s voice', async () => {
    mockAudio = { ...mockAudio, hasAudio: false, source: null };
    await renderModal();
    expect(screen.getByText('No recording yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Play hello' }));
    expect(mockSpeak).not.toHaveBeenCalled();
  });
});

it('practice uses the shared flow against this phrase, three tries, without a second play button', async () => {
  await renderModal();

  expect(screen.getByText('Practice saying it')).toBeOnTheScreen();
  expect(mockPracticeProps).toHaveBeenCalledWith(
    expect.objectContaining({ matchGroup: phrase, nativeVariant: variant, maxAttempts: 3, showNativeButton: false })
  );
});

it('finishing resets practice so they can go again, without closing the phrase', async () => {
  const { onClose } = await renderModal();
  expect(mockPracticeMounts).toBe(1);

  await fireEvent.press(screen.getByText('Finish practice'));

  expect(mockPracticeMounts).toBe(2);
  expect(onClose).not.toHaveBeenCalled();
});

it('recording practice is always offered (adults-only app — no per-profile mic restriction)', async () => {
  await renderModal();
  expect(screen.getByText('Practice saying it')).toBeOnTheScreen();
  expect(mockPracticeProps).toHaveBeenCalled();
});

it('offers the explanation for a phrase that has one, next to the pronunciation', async () => {
  const withExplanation = { ...phrase, variants: [{ ...variant, explanationAudioPath: 'g/v1-explanation.m4a' }] };
  await render(
    <ThemeProvider>
      <PhraseDetailModal phrase={withExplanation} onClose={jest.fn()} />
    </ThemeProvider>
  );
  expect(screen.getByText('[explanation g/v1-explanation.m4a]')).toBeOnTheScreen();
});

it('no explanation: no explanation control', async () => {
  await renderModal();
  expect(screen.queryByText(/\[explanation/)).toBeNull();
});

it('shows the phrase’s "Words used" cards', async () => {
  await renderModal();
  expect(screen.getByText('[words used for pb1]')).toBeOnTheScreen();
});
