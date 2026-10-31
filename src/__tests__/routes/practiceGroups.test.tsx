// Practice answers "how do I practise?" with three short groups — Review &
// remember (Review, Flashcards), Listen (Listening Practice), Speak (Speaking
// Practice → the existing chooser). The reference features (Alphabet,
// Phrasebook, Grammar Notes, Culture Corner) now live on Learn.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Practice = require('../../../app/(tabs)/practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderPractice = () => render(<ThemeProvider><Practice /></ThemeProvider>);

beforeEach(() => mockPush.mockReset());

const GROUPS: [string, [string, string][]][] = [
  ['Review & remember', [['Review', '/review'], ['Flashcards', '/flashcards']]],
  ['Listen', [['Listening Practice', '/listening-practice']]],
  ['Speak', [['Speaking Practice', '/speaking']]],
];

it('three groups with headings, each with its activities and a one-line description', async () => {
  await renderPractice();
  for (const [heading, items] of GROUPS) {
    const group = screen.getByLabelText(`${heading} activities`);
    expect(within(group).getByRole('header', { name: heading })).toBeOnTheScreen();
    for (const [title] of items) {
      const button = within(group).getByRole('button', { name: new RegExp(`^${title}\\b`) });
      // Title plus a short description, read together.
      expect(button.props.accessibilityLabel.length).toBeGreaterThan(title.length + 5);
    }
  }
});

it('each activity opens its existing route', async () => {
  await renderPractice();
  for (const [, items] of GROUPS) {
    for (const [title, href] of items) {
      mockPush.mockReset();
      await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${title}\\b`) }));
      expect(mockPush).toHaveBeenCalledWith(href);
    }
  }
});

it('no Alphabet, Phrasebook, Grammar Notes or Culture Corner here (they’re on Learn)', async () => {
  await renderPractice();
  for (const moved of [/Alphabet/, /Phrasebook/, /Grammar Notes/, /Culture Corner/]) {
    expect(screen.queryByText(moved)).toBeNull();
  }
  expect(screen.getAllByRole('button')).toHaveLength(4);
});
