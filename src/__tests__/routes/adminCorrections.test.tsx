// The language-review queue (app/admin/corrections.tsx) is only for
// allowlisted reviewers (public.reviewers) — being an admin isn't enough.
// Membership is resolved before anything is fetched or rendered: loading
// while it's checked, an error with retry if the check fails (never "yes"),
// access denied for non-reviewers, and the queue only for reviewers.
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockFetchIsReviewer = jest.fn();
const mockFetchPending = jest.fn();
const mockFetchReviewed = jest.fn();
const mockSubmitReview = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/data/reviewers', () => ({ fetchIsReviewer: (...a: unknown[]) => mockFetchIsReviewer(...a) }));
jest.mock('@/data/corrections', () => ({
  fetchPendingCorrections: (...a: unknown[]) => mockFetchPending(...a),
  fetchReviewedCorrections: (...a: unknown[]) => mockFetchReviewed(...a),
  submitReview: (...a: unknown[]) => mockSubmitReview(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Screen = require('../../../app/admin/corrections').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const CorrectionsReview = () => (
  <ThemeProvider>
    <Screen />
  </ThemeProvider>
);

const pendingRow = {
  id: 'c1',
  profileId: 'p1',
  createdAt: '2026-10-27T10:00:00Z',
  targetTable: 'sentence',
  tunisian: 'chnowa ahwelek',
  english: 'how are you',
  transliteration: 'chnowa ahwelek',
};

beforeEach(() => {
  [mockFetchIsReviewer, mockFetchPending, mockFetchReviewed, mockSubmitReview].forEach((m) => m.mockReset());
  mockFetchPending.mockResolvedValue([pendingRow]);
  mockFetchReviewed.mockResolvedValue([]);
  mockSubmitReview.mockResolvedValue(undefined);
});

it('while membership is being checked: a loading state, and the queue is neither fetched nor shown', async () => {
  mockFetchIsReviewer.mockReturnValue(new Promise(() => {}));
  await render(<CorrectionsReview />);

  expect(screen.getByTestId('reviewer-check-loading')).toBeOnTheScreen();
  expect(mockFetchPending).not.toHaveBeenCalled();
  expect(screen.queryByText('Correction Review')).toBeNull();
  expect(screen.queryByText('chnowa ahwelek')).toBeNull();
});

it('a non-reviewer (even an admin) gets access denied and the queue is never fetched', async () => {
  mockFetchIsReviewer.mockResolvedValue(false);
  await render(<CorrectionsReview />);

  expect(await screen.findByText(/only approved language reviewers/i)).toBeOnTheScreen();
  expect(mockFetchPending).not.toHaveBeenCalled();
  expect(mockFetchReviewed).not.toHaveBeenCalled();
  expect(screen.queryByText('chnowa ahwelek')).toBeNull();
});

it('a failed membership check fails closed with a retry, and retrying can let a reviewer in', async () => {
  mockFetchIsReviewer.mockRejectedValueOnce(new Error('network'));
  await render(<CorrectionsReview />);

  expect(await screen.findByText(/couldn.t check your reviewer access/i)).toBeOnTheScreen();
  expect(mockFetchPending).not.toHaveBeenCalled();

  mockFetchIsReviewer.mockResolvedValueOnce(true);
  await fireEvent.press(screen.getByText('Try again'));

  expect(await screen.findByText('Correction Review')).toBeOnTheScreen();
  expect(mockFetchIsReviewer).toHaveBeenCalledTimes(2);
  expect(mockFetchPending).toHaveBeenCalledTimes(1);
});

it('a reviewer sees the queue, fetched only after membership resolved', async () => {
  let resolveCheck: (v: boolean) => void = () => {};
  mockFetchIsReviewer.mockReturnValue(new Promise<boolean>((r) => (resolveCheck = r)));
  await render(<CorrectionsReview />);
  expect(mockFetchPending).not.toHaveBeenCalled();

  await act(async () => resolveCheck(true));

  expect(await screen.findByText('Correction Review')).toBeOnTheScreen();
  expect(mockFetchPending).toHaveBeenCalledTimes(1);
  expect(screen.getByDisplayValue('how are you')).toBeOnTheScreen();
});

it('a reviewer can still approve a correction as before', async () => {
  mockFetchIsReviewer.mockResolvedValue(true);
  await render(<CorrectionsReview />);
  await screen.findByText('Correction Review');

  await fireEvent.changeText(screen.getByPlaceholderText(/your name/i), 'Native reviewer');
  await fireEvent.press(screen.getByText('✅ Correct as shown'));

  expect(mockSubmitReview).toHaveBeenCalledWith(
    expect.objectContaining({ correctionId: 'c1', action: 'approve', targetTable: 'sentence', reviewerName: 'Native reviewer' })
  );
  expect(screen.queryByDisplayValue('how are you')).toBeNull();
});
