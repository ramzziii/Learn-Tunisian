// Welcome shows the value statement and a link to "Why Tunisian, not MSA?"
// without getting in the way of signing up; that screen explains the focus
// on spoken Tunisian and who the app is for. Both read from appCopy.
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: (...a: unknown[]) => mockBack(...a), canGoBack: () => true },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Welcome = require('../../../app/welcome').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WhyTunisian = require('../../../app/why-tunisian').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const copy = require('@/constants/appCopy');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => mockPush.mockClear());

describe('Welcome', () => {
  it('shows the value statement and supporting line from the shared copy', async () => {
    await themed(<Welcome />);
    expect(screen.getByText(copy.VALUE_STATEMENT)).toBeOnTheScreen();
    expect(screen.getByText(copy.SUPPORTING_LINE)).toBeOnTheScreen();
    for (const b of copy.WELCOME_BENEFITS) expect(screen.getByText(b.text)).toBeOnTheScreen();
  });

  it('drops the claim that lessons are shaped around goals and level', async () => {
    await themed(<Welcome />);
    expect(screen.queryByText(/shaped around/i)).toBeNull();
  });

  it('signing up is still the main action', async () => {
    await themed(<Welcome />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start learning free' }));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/age');
  });

  it('links to “Why Tunisian, not MSA?”', async () => {
    await themed(<Welcome />);
    await fireEvent.press(screen.getByRole('link', { name: 'Why Tunisian, not MSA?' }));
    expect(mockPush).toHaveBeenCalledWith('/why-tunisian');
  });
});

describe('Why Tunisian, not MSA?', () => {
  it('explains the focus and lists who it’s for', async () => {
    await themed(<WhyTunisian />);
    expect(screen.getByRole('header', { name: copy.WHY_TUNISIAN.title })).toBeOnTheScreen();
    for (const p of copy.WHY_TUNISIAN.paragraphs) expect(screen.getByText(p)).toBeOnTheScreen();
    expect(screen.getByText('Who it’s for')).toBeOnTheScreen();
    for (const who of copy.WHO_ITS_FOR) expect(screen.getByText(who)).toBeOnTheScreen();
  });
});
