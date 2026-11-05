// Before the guest preview: a simple "I'm 18 or older" confirmation — no date
// of birth is asked. "Yes" starts the device-only guest preview; "No" shows
// the adults-only message and sets the device's retry block; while blocked,
// the preview can't be started.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockStartGuest = jest.fn(async () => undefined);
const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/guest/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, isLoading: false, startGuest: mockStartGuest, endGuest: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GuestAge = require('../../../app/guest/age').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () => render(<ThemeProvider><GuestAge /></ThemeProvider>);

beforeEach(() => {
  mockReplace.mockReset();
  mockStartGuest.mockClear();
  mockStore.clear();
});

it('asks a yes/no question — no date of birth', async () => {
  await renderScreen();
  expect(await screen.findByText('Are you 18 or older?')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: "Yes, I'm 18 or older" })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'No' })).toBeOnTheScreen();
  expect(screen.queryByLabelText(/Birth (month|day|year)/)).toBeNull();
});

it('Yes starts the guest preview and goes home', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByRole('button', { name: "Yes, I'm 18 or older" }));
  expect(mockStartGuest).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/home');
});

it('No shows the adults-only message, sets the retry block and doesn’t start the preview', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByRole('button', { name: 'No' }));
  expect(screen.getByText(/only for adults/i)).toBeOnTheScreen();
  expect(mockStartGuest).not.toHaveBeenCalled();
  expect(JSON.parse(mockStore.get('learn-tunisian.age-retry-block')!)).toEqual(
    expect.objectContaining({ blocked: true })
  );
});

it('while the retry block is on, the preview can’t be started', async () => {
  mockStore.set('learn-tunisian.age-retry-block', JSON.stringify({ blocked: true, until: new Date(Date.now() + 3_600_000).toISOString() }));
  await renderScreen();
  expect(await screen.findByText(/only for adults/i)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: "Yes, I'm 18 or older" })).toBeNull();
});
