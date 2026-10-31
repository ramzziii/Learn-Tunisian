// Exercises that test one particular script ignore the script preference for
// that script, and say why: reading match always shows Arabic (it tests
// reading Arabic); typing always shows the Latin transliteration (that's
// what you type). The note only appears when the preference would
// otherwise have hidden it.
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ExerciseItem } from '@/types/exercises';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, hasError: false, isFallbackVoice: false, isPlaying: false, retry: jest.fn() }),
}));
jest.mock('@/hooks/useAnswerFeedback', () => ({ useAnswerFeedback: () => ({ playCorrect: jest.fn(), playIncorrect: jest.fn() }) }));
jest.mock('@/components/exercises/shared/VariantCallout', () => ({ VariantCallout: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ReadingMatch } = require('@/components/exercises/adult/ReadingMatch');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TypingSpelling } = require('@/components/exercises/adult/TypingSpelling');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisplayPreferencesOverride } = require('@/lib/display/useDisplayPreferences');

const v = (id: string, arabic: string) => ({ id: `${id}-v`, variantLabel: 'primary', wordArabic: arabic, transliteration: id });
const g = (id: string, arabic: string) => ({ id, englishMeaning: `${id} meaning`, variants: [v(id, arabic)] });
const target = g('salam', 'سلام');
const other = g('bonni', 'بني');
const exercise = (type: string) =>
  ({
    key: 'k',
    type,
    targetGroup: target,
    promptVariant: target.variants[0],
    options: [
      { group: target, variant: target.variants[0] },
      { group: other, variant: other.variants[0] },
    ],
  }) as unknown as ExerciseItem;

const renderWith = (script: string, el: React.ReactElement) =>
  render(
    <ThemeProvider>
      <DisplayPreferencesOverride preferences={{ script, form: 'both' }}>{el}</DisplayPreferencesOverride>
    </ThemeProvider>
  );

describe('reading match tests reading Arabic', () => {
  it('Latin-only learners still see the Arabic options, with a short note why', async () => {
    await renderWith('latin', <ReadingMatch exercise={exercise('reading_match')} onComplete={jest.fn()} />);
    expect(screen.getByText('سلام')).toBeOnTheScreen();
    expect(screen.getByText('بني')).toBeOnTheScreen();
    expect(screen.getByText('This exercise practises reading Arabic script, so Arabic is always shown.')).toBeOnTheScreen();
  });

  it('no note when Arabic would be shown anyway', async () => {
    await renderWith('both', <ReadingMatch exercise={exercise('reading_match')} onComplete={jest.fn()} />);
    expect(screen.queryByText(/practises reading Arabic script/)).toBeNull();
  });

  it('Arabic-only learners don’t get transliterations under the options', async () => {
    await renderWith('arabic', <ReadingMatch exercise={exercise('reading_match')} onComplete={jest.fn()} />);
    expect(screen.queryByText('bonni')).toBeNull();
  });
});

describe('typing is answered in transliteration', () => {
  it('Arabic-only learners still see Latin in the answer, with a short note why', async () => {
    await renderWith('arabic', <TypingSpelling exercise={exercise('typing_spelling')} onComplete={jest.fn()} />);
    expect(screen.getByText('You’ll type Latin letters here, so the transliteration is always shown.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByPlaceholderText(/type/i), 'wrong');
    await fireEvent.press(screen.getByText('Check'));
    expect(screen.getAllByText('salam').length).toBeGreaterThan(0);
  });
});
