// The Profile entry into Request a Translation — also the in-app notice that
// an answer is ready (generic wording: never the request or answer text).
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockFetchMine = jest.fn();
const mockPush = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(cb, []);
  },
}));
jest.mock('@/data/translationRequests', () => ({ fetchMyTranslationRequests: (...a: unknown[]) => mockFetchMine(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TranslationRequestsEntry } = require('@/components/translation/TranslationRequestsEntry');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderEntry = () =>
  render(
    <ThemeProvider>
      <TranslationRequestsEntry />
    </ThemeProvider>
  );

beforeEach(() => {
  mockFetchMine.mockReset().mockResolvedValue([]);
  mockPush.mockReset();
});

it('opens Request a Translation', async () => {
  await renderEntry();

  await fireEvent.press(screen.getByText('Request a Translation'));
  expect(mockPush).toHaveBeenCalledWith('/translation-requests');
});

it('says when answers are ready — without showing any request or answer text', async () => {
  mockFetchMine.mockResolvedValue([
    { id: 'r1', englishText: 'Secret phrase', status: 'answered', isNewAnswer: true, answer: { arabic: 'سر' } },
    { id: 'r2', englishText: 'Other', status: 'answered', isNewAnswer: false, answer: { arabic: 'آخر' } },
  ]);
  await renderEntry();

  expect(await screen.findByText(/Your translation is ready/)).toBeOnTheScreen();
  expect(screen.queryByText(/Secret phrase|سر/)).toBeNull();
});

it('several new answers', async () => {
  mockFetchMine.mockResolvedValue([
    { id: 'r1', status: 'answered', isNewAnswer: true },
    { id: 'r2', status: 'answered', isNewAnswer: true },
  ]);
  await renderEntry();
  expect(await screen.findByText(/2 translations are ready/)).toBeOnTheScreen();
});

it('if the check fails (offline), the entry still works and shows no error', async () => {
  mockFetchMine.mockRejectedValue(new Error('Failed to fetch'));
  await renderEntry();

  expect(screen.getByText('Request a Translation')).toBeOnTheScreen();
  expect(screen.queryByText(/ready|error|failed/i)).toBeNull();
});
