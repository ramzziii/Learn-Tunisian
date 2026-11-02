// "Tap the word you hear" and "Type what you hear" are listening exercises:
// they only ever play a native recording (never the computer voice or the
// phone's voice). A word without a native recording is asked from its
// meaning instead, with no audio button.
import { render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

const mockUseWordAudioPlayer = jest.fn((..._args: unknown[]) => ({
  play: jest.fn(),
  hasAudio: true,
  isResolving: false,
  hasError: false,
  source: 'native',
  isPlaying: false,
  retry: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({ useWordAudioPlayer: (...a: unknown[]) => mockUseWordAudioPlayer(...a) }));
jest.mock('@/hooks/useAnswerFeedback', () => ({ useAnswerFeedback: () => ({ playCorrect: jest.fn(), playIncorrect: jest.fn() }) }));
jest.mock('@/components/exercises/shared/VariantCallout', () => ({ VariantCallout: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ReadingMatch } = require('@/components/exercises/adult/ReadingMatch');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TypingSpelling } = require('@/components/exercises/adult/TypingSpelling');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const exerciseFor = (type: 'reading_match' | 'typing_spelling', native: boolean) => {
  const variant = {
    id: 'v1',
    variantLabel: 'primary',
    wordArabic: 'سلام',
    transliteration: 'salam',
    audioPath: 'words/salam.m4a',
    isNativeVoice: native,
  };
  const group = { id: 'salam', englishMeaning: 'peace', variants: [variant] };
  return { key: 'k', type, targetGroup: group, promptVariant: variant, options: [{ group, variant }] } as unknown as ExerciseItem;
};

const renderWith = (Component: React.ComponentType<{ exercise: ExerciseItem; onComplete: () => void }>, exercise: ExerciseItem) =>
  render(
    <ThemeProvider>
      <Component exercise={exercise} onComplete={jest.fn()} />
    </ThemeProvider>
  );

beforeEach(() => mockUseWordAudioPlayer.mockClear());

describe('Tap the word you hear (ReadingMatch)', () => {
  it('with a native recording: plays it (native only) and asks by ear', async () => {
    const exercise = exerciseFor('reading_match', true);
    await renderWith(ReadingMatch, exercise);
    expect(screen.getByText('Tap the word you hear')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeOnTheScreen();
    expect(mockUseWordAudioPlayer).toHaveBeenCalledWith(exercise.promptVariant, { autoPlay: true, nativeOnly: true });
  });

  it('without one: asks from the meaning, with no audio at all', async () => {
    await renderWith(ReadingMatch, exerciseFor('reading_match', false));
    expect(screen.getByText('Tap the Tunisian for “peace”')).toBeOnTheScreen();
    expect(screen.queryByText('Tap the word you hear')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play audio' })).toBeNull();
    expect(mockUseWordAudioPlayer).toHaveBeenCalledWith(null, { autoPlay: true, nativeOnly: true });
  });
});

describe('Type what you hear (TypingSpelling)', () => {
  it('with a native recording: plays it (native only) and asks by ear', async () => {
    const exercise = exerciseFor('typing_spelling', true);
    await renderWith(TypingSpelling, exercise);
    expect(screen.getByText('Type what you hear')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeOnTheScreen();
    expect(mockUseWordAudioPlayer).toHaveBeenCalledWith(exercise.promptVariant, { autoPlay: true, nativeOnly: true });
  });

  it('without one: asks for the Tunisian for the meaning, with no audio', async () => {
    await renderWith(TypingSpelling, exerciseFor('typing_spelling', false));
    expect(screen.getByText('Type the Tunisian for this')).toBeOnTheScreen();
    expect(screen.queryByText('Type what you hear')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play audio' })).toBeNull();
    expect(mockUseWordAudioPlayer).toHaveBeenCalledWith(null, { autoPlay: true, nativeOnly: true });
  });
});
