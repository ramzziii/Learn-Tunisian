// Phrasebook phrase pop-up: "Practice saying it" is the shared record →
// check → compare flow (tested in PronunciationPractice.test.tsx).
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPracticeProps = jest.fn();
let mockPracticeMounts = 0;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, isFallbackVoice: false, isPlaying: false, retry: jest.fn() }),
}));
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

async function renderModal(track = 'adult') {
  const onClose = jest.fn();
  await render(
    <ThemeProvider>
      <PhraseDetailModal phrase={phrase} track={track} onClose={onClose} />
    </ThemeProvider>
  );
  return { onClose };
}

beforeEach(() => {
  mockPracticeProps.mockClear();
  mockPracticeMounts = 0;
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

it('kid profiles never see recording (no mic prompts for kids)', async () => {
  await renderModal('kid');
  expect(screen.queryByText('Practice saying it')).toBeNull();
  expect(mockPracticeProps).not.toHaveBeenCalled();
});

it('offers the explanation for a phrase that has one, next to the pronunciation', async () => {
  const withExplanation = { ...phrase, variants: [{ ...variant, explanationAudioPath: 'g/v1-explanation.m4a' }] };
  await render(
    <ThemeProvider>
      <PhraseDetailModal phrase={withExplanation} track="adult" onClose={jest.fn()} />
    </ThemeProvider>
  );
  expect(screen.getByText('[explanation g/v1-explanation.m4a]')).toBeOnTheScreen();
});

it('no explanation: no explanation control', async () => {
  await renderModal();
  expect(screen.queryByText(/\[explanation/)).toBeNull();
});
