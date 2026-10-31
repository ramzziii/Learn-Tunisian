// Showing a word that has masculine and feminine forms: the preferred form
// first (or alone), labelled in words; an accessible "Show the other form"
// toggle that doesn't change the saved preference; each form plays ITS OWN
// recording, and a form without one says so instead of playing the other
// form's audio or a device voice. One-form words show just that form.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';

const mockEnsureAudioCached = jest.fn();
const mockSpeak = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn(), pause: jest.fn() };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/lib/offline/audioCache', () => ({ ensureAudioCached: (...a: unknown[]) => mockEnsureAudioCached(...a) }));
jest.mock('expo-speech', () => ({ speak: (...a: unknown[]) => mockSpeak(...a), stop: jest.fn() }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FormDisplay } = require('@/components/tunisian/FormDisplay');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisplayPreferencesOverride } = require('@/lib/display/useDisplayPreferences');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const masculine = makeVariant('tired', { variantLabel: 'masculine', wordArabic: 'تعبان', transliteration: 'ta3ban', audioPath: 'tired/m.m4a' });
const feminine = makeVariant('tired', { variantLabel: 'feminine', wordArabic: 'تعبانة', transliteration: 'ta3bana', audioPath: 'tired/f.m4a' });
const pair = makeGroup('tired', { variants: [masculine, feminine] });

const renderWith = (form: string, group = pair, props: Record<string, unknown> = {}) =>
  render(
    <ThemeProvider>
      <DisplayPreferencesOverride preferences={{ script: 'both', form }}>
        <FormDisplay group={group} {...props} />
      </DisplayPreferencesOverride>
    </ThemeProvider>
  );

beforeEach(() => {
  mockEnsureAudioCached.mockReset().mockImplementation(async (v: { audioPath: string | null }) => (v.audioPath ? `file:///${v.audioPath}` : null));
  mockSpeak.mockReset();
  Object.values(mockPlayer).forEach((fn) => fn.mockClear());
});

it('feminine preference: the feminine form alone, labelled, with the other one tap away', async () => {
  await renderWith('feminine');
  expect(screen.getByText('Feminine form')).toBeOnTheScreen();
  expect(screen.getByText('تعبانة')).toBeOnTheScreen();
  expect(screen.queryByText('تعبان')).toBeNull();
  const toggle = screen.getByRole('button', { name: 'Show the other form' });
  expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
});

it('revealing the other form shows it and plays its own recording', async () => {
  await renderWith('feminine');
  await fireEvent.press(screen.getByRole('button', { name: 'Show the other form' }));

  expect(screen.getByText('Masculine form')).toBeOnTheScreen();
  expect(screen.getByText('تعبان')).toBeOnTheScreen();
  expect(mockEnsureAudioCached).toHaveBeenCalledWith(masculine);
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///tired/m.m4a' });
  expect(screen.getByRole('button', { name: 'Hide the other form' }).props.accessibilityState).toMatchObject({ expanded: true });
});

it('each form’s play button plays that form', async () => {
  await renderWith('both');
  await fireEvent.press(screen.getByRole('button', { name: 'Play feminine form' }));
  expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: 'file:///tired/f.m4a' });
});

it('show both: both forms, masculine then feminine, and no toggle', async () => {
  await renderWith('both');
  expect(screen.getByText('تعبان')).toBeOnTheScreen();
  expect(screen.getByText('تعبانة')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /show the other form/i })).toBeNull();
});

it('a form without a recording says so — never the other form’s audio, never a device voice', async () => {
  const silentFeminine = makeVariant('tired', { variantLabel: 'feminine', wordArabic: 'تعبانة', transliteration: 'ta3bana', audioPath: null });
  await renderWith('feminine', makeGroup('tired', { variants: [masculine, silentFeminine] }));

  expect(screen.getByText('No recording for this form yet')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Play feminine form' })).toBeNull();
  expect(mockPlayer.replace).not.toHaveBeenCalledWith({ uri: 'file:///tired/m.m4a' });
  expect(mockSpeak).not.toHaveBeenCalled();
});

it('a one-form word: just that form, no form label, no toggle', async () => {
  const single = makeGroup('hello', { variants: [makeVariant('hello', { wordArabic: 'عسلامة', transliteration: 'aslema', audioPath: 'hello/p.m4a' })] });
  await renderWith('feminine', single);
  expect(screen.getByText('عسلامة')).toBeOnTheScreen();
  expect(screen.queryByText(/masculine form|feminine form/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /other form/i })).toBeNull();
});

it('never words the forms as the learner’s identity', async () => {
  await renderWith('both');
  expect(screen.queryByText(/boy|girl|your gender|you are a/i)).toBeNull();
});
