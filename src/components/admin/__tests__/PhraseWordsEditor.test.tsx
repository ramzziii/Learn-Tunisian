// Admin "Words used" editor for a phrase:
// - suggests words found in the phrase: matches start ticked, possible
//   matches are labelled and unticked;
// - nothing is saved until "Save words used" is pressed;
// - untick, tick a possible match, reorder, search and add by hand — the
//   saved list is the ticked words, in the order shown, with the word as it
//   appears in the phrase;
// - a phrase's saved list loads first, in its saved order.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

const mockSave = jest.fn(async () => undefined);
let mockSaved: { wordId: string; shownArabic: string; shownLatin: string }[] = [];
const word = (id: string, arabic: string, latin: string, meaning: string) =>
  makeGroup(id, { englishMeaning: meaning, variants: [makeVariant(id, { wordArabic: arabic, transliteration: latin })] });
const mockCandidates = () => [
  word('please', 'يعيشك', 'ya3ichek', 'Please'),
  word('door', 'باب', 'beb', 'Door'),
  word('close', 'نسكّر', 'nsakker', 'I close'),
  word('chair', 'كرسي', 'korsi', 'Chair'),
];
jest.mock('@/data/admin/phraseWords', () => ({
  fetchLinkCandidatesAdmin: jest.fn(async () => mockCandidates()),
  fetchPhraseWordLinksAdmin: jest.fn(async () => mockSaved),
  savePhraseWordLinks: (...a: unknown[]) => mockSave(...(a as [])),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PhraseWordsEditor } = require('@/components/admin/PhraseWordsEditor');

const phrase = word('pb_close_door', 'سكّر الباب يعيشك', 'Sakker el beb ya3ichek', 'Close the door please');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
const renderEditor = () =>
  render(
    <ThemeProvider>
      <PhraseWordsEditor phrase={phrase} />
    </ThemeProvider>
  );
const savedArg = () => (mockSave.mock.calls.at(-1) as unknown as [string, { wordId: string; shownArabic: string; shownLatin: string }[]])[1];
const checkbox = (meaning: string) => screen.getByRole('checkbox', { name: new RegExp(`^${meaning} —`) });
const rows = () => screen.getAllByRole('checkbox').map((c) => [c.props.accessibilityLabel, c.props.accessibilityState.checked]);

beforeEach(() => {
  mockSave.mockClear();
  mockSaved = [];
});

it('suggests the words in the phrase: matches ticked, possible matches labelled and unticked, in phrase order', async () => {
  await renderEditor();
  await screen.findByText('Door');
  expect(rows()).toEqual([
    ['I close — possible match', false],
    ['Door — match', true],
    ['Please — match', true],
  ]);
  expect(screen.getAllByText('Possible match')).toHaveLength(1);
  expect(mockSave).not.toHaveBeenCalled();
});

it('nothing is linked until Save: then only the ticked words, in order, as they appear in the phrase', async () => {
  await renderEditor();
  await screen.findByText('Door');
  await fireEvent.press(screen.getByRole('button', { name: 'Save words used' }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect((mockSave.mock.calls[0] as unknown as [string])[0]).toBe('pb_close_door');
  expect(savedArg()).toEqual([
    { wordId: 'door', shownArabic: 'الباب', shownLatin: 'beb' },
    { wordId: 'please', shownArabic: 'يعيشك', shownLatin: 'ya3ichek' },
  ]);
});

it('untick a match, tick a possible match, move it down', async () => {
  await renderEditor();
  await screen.findByText('Door');
  await fireEvent.press(checkbox('Please'));
  await fireEvent.press(checkbox('I close'));
  await fireEvent.press(screen.getByRole('button', { name: 'Move I close down' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save words used' }));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(savedArg().map((l) => [l.wordId, l.shownLatin])).toEqual([
    ['door', 'beb'],
    ['close', 'Sakker'],
  ]);
});

it('search and add a word by hand; words already listed are not offered', async () => {
  await renderEditor();
  await screen.findByText('Door');
  await fireEvent.changeText(screen.getByLabelText('Search words to add'), 'korsi');
  await fireEvent.press(await screen.findByRole('button', { name: 'Add Chair' }));
  await fireEvent.changeText(screen.getByLabelText('Search words to add'), 'beb');
  expect(screen.queryByRole('button', { name: 'Add Door' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save words used' }));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(savedArg().map((l) => l.wordId)).toEqual(['door', 'please', 'chair']);
});

it('the shown form can be edited before saving', async () => {
  await renderEditor();
  await screen.findByText('Door');
  await fireEvent.changeText(screen.getByLabelText('Door: Latin as in the phrase'), 'el beb');
  await fireEvent.press(screen.getByRole('button', { name: 'Save words used' }));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(savedArg()[0]).toEqual({ wordId: 'door', shownArabic: 'الباب', shownLatin: 'el beb' });
});

it('a saved list loads first, in its saved order, ticked', async () => {
  mockSaved = [
    { wordId: 'please', shownArabic: 'يعيشك', shownLatin: 'ya3ichek' },
    { wordId: 'chair', shownArabic: 'كرسي', shownLatin: 'korsi' },
  ];
  await renderEditor();
  await screen.findByText('Chair');
  expect(rows()).toEqual([
    ['Please — linked', true],
    ['Chair — linked', true],
    ['I close — possible match', false],
    ['Door — match', true],
  ]);
});

it('an empty shown form is refused before saving', async () => {
  await renderEditor();
  await screen.findByText('Door');
  await fireEvent.changeText(screen.getByLabelText('Door: Arabic as in the phrase'), ' ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save words used' }));
  expect(await screen.findByText('Each ticked word needs its Arabic and Latin as they appear in the phrase.')).toBeOnTheScreen();
  expect(mockSave).not.toHaveBeenCalled();
});
