// "Words used" cards for learners, under a phrase:
// - in the saved order, each showing the word as it appears in the phrase
//   plus its meaning; tapping opens the word's page;
// - a word the learner can't open yet (outside the practice scope) shows only
//   the form already visible in the phrase, locked, with no meaning; tapping
//   goes to the word page's locked state (guests: the create-account prompt);
// - if access can't be checked, an error — never open cards;
// - nothing linked: no section at all.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { makeGroup, makeVariant } from '@/test-utils/wordGroupFixtures';

const mockPush = jest.fn();
const mockFetch = jest.fn();
let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockScopeState: { scope: unknown; error: boolean; reload: jest.Mock } = { scope: null, error: false, reload: jest.fn() };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/data/phraseWords', () => ({ fetchWordsUsed: (...a: unknown[]) => mockFetch(...a) }));
jest.mock('@/lib/access/AccessContext', () => ({ useAccess: () => ({ tier: mockTier, isResolved: true }) }));
jest.mock('@/lib/access/usePracticeScope', () => ({ usePracticeScope: () => mockScopeState }));
jest.mock('@/lib/display/useDisplayPreferences', () => ({
  useDisplayPreferences: () => ({ preferences: { script: 'both', form: 'default' } }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WordsUsedSection } = require('@/components/phraseWords/WordsUsedSection');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildPracticeScope } = require('@/lib/access/practiceScope');

const word = (id: string, unitId: string, meaning: string) =>
  makeGroup(id, { unitId, lessonNumber: 1, englishMeaning: meaning, variants: [makeVariant(id, { transliteration: id })] });
const USED = [
  { wordId: 'close', shownArabic: 'سكّر', shownLatin: 'Sakker', word: word('close', 'u1', 'I close') },
  { wordId: 'door', shownArabic: 'الباب', shownLatin: 'el beb', word: word('door', 'u2', 'Door') },
];
const renderSection = () =>
  render(
    <ThemeProvider>
      <WordsUsedSection phraseId="pb_close_door" />
    </ThemeProvider>
  );

beforeEach(() => {
  mockPush.mockReset();
  mockFetch.mockReset().mockResolvedValue(USED);
  mockTier = 'free';
  mockScopeState = {
    scope: buildPracticeScope({ all: false, openLessons: [{ unitId: 'u1', lessonNumber: 1 }], openUnitIds: [] }),
    error: false,
    reload: jest.fn(),
  };
});

it('cards in the saved order: the word as it appears in the phrase, its meaning; tap opens the word page', async () => {
  await renderSection();
  expect(await screen.findByText('Words used')).toBeOnTheScreen();
  const cards = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
  expect(cards).toEqual(['Sakker — I close', 'el beb — locked']);
  expect(screen.getByText('سكّر')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Sakker — I close' }));
  expect(mockPush).toHaveBeenCalledWith('/word/close');
  expect(mockFetch).toHaveBeenCalledWith('pb_close_door');
});

it('a word in a lesson the learner can’t open: only the phrase’s own form, locked, no meaning; tap shows the word page’s locked state', async () => {
  await renderSection();
  await screen.findByText('Words used');
  expect(screen.queryByText('Door')).toBeNull();
  expect(screen.getByText('الباب')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'el beb — locked' }));
  expect(mockPush).toHaveBeenCalledWith('/word/door');
});

it('Premium: every linked word opens', async () => {
  mockTier = 'premium';
  mockScopeState = { ...mockScopeState, scope: buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }) };
  await renderSection();
  await screen.findByText('Words used');
  expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Sakker — I close', 'el beb — Door']);
});

it('guest: a word outside the preview is locked, and tapping it offers a free account', async () => {
  mockTier = 'guest';
  mockScopeState = { ...mockScopeState, scope: buildPracticeScope({ all: true, openLessons: [], openUnitIds: [] }) };
  mockFetch.mockResolvedValue([USED[0], { ...USED[1], word: null }]);
  await renderSection();
  await fireEvent.press(await screen.findByRole('button', { name: 'el beb — locked' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/guest/create-account', params: { reason: 'keep-learning' } });
});

it('access can’t be checked: an error and a retry — never open cards', async () => {
  mockScopeState = { scope: null, error: true, reload: jest.fn() };
  await renderSection();
  expect(await screen.findByText('Couldn’t check which words you can open.')).toBeOnTheScreen();
  expect(screen.queryByText('I close')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(mockScopeState.reload).toHaveBeenCalled();
});

it('the links can’t load: an error and a retry', async () => {
  mockFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(USED);
  await renderSection();
  expect(await screen.findByText('Couldn’t load the words used.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('I close')).toBeOnTheScreen();
});

it('nothing linked: no section', async () => {
  mockFetch.mockResolvedValue([]);
  await renderSection();
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText('Words used')).toBeNull();
});
