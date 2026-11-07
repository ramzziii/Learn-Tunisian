// Admin → Review → one at a time (language reviewers): Correct, Fix or
// Reject each waiting form through review_word_variant (0028), then the next.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockFetch = jest.fn();
const mockReview = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/hooks/useWordAudioPlayer', () => ({
  useWordAudioPlayer: () => ({ play: jest.fn(), hasAudio: true, isResolving: false, isPlaying: false, source: 'native' }),
}));
jest.mock('@/data/admin/reviewSession', () => {
  // The real message mapping, without the Supabase client.
  const actual = jest.requireActual('@/data/admin/reviewSession');
  return {
    fetchFormsToReview: (...a: unknown[]) => mockFetch(...a),
    reviewWordVariant: (...a: unknown[]) => mockReview(...a),
    reviewErrorMessage: actual.reviewErrorMessage,
  };
});
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReviewSession = require('../../../app/admin/review-session').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const form = (id: string, meaning: string, arabic: string, latin: string, audioPath: string | null = null) => ({
  variant: { id, wordGroupId: `g-${id}`, variantLabel: 'primary', wordArabic: arabic, transliteration: latin, audioPath },
  englishMeaning: meaning,
  unitName: 'Daily Phrases',
  lessonNumber: 8,
});
const renderSession = () =>
  render(
    <ThemeProvider>
      <ReviewSession />
    </ThemeProvider>
  );

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue([form('v1', 'all done', 'كملت', 'kamelt', 'g/v1.m4a'), form('v2', 'more please', 'شوية أخرى', 'chwaya okhra')]);
  mockReview.mockReset().mockResolvedValue('draft');
});

it('shows one form at a time with its meaning, spelling, place and recording', async () => {
  await renderSession();
  expect(await screen.findByText('all done')).toBeOnTheScreen();
  expect(screen.getByText('كملت')).toBeOnTheScreen();
  expect(screen.getByText('kamelt')).toBeOnTheScreen();
  expect(screen.getByText('Daily Phrases · Lesson 8')).toBeOnTheScreen();
  expect(screen.getByLabelText('Listen to all done')).toBeOnTheScreen();
  expect(screen.getByText('2 left')).toBeOnTheScreen();
});

it('Correct approves it, says when the word is live, and the next form comes up', async () => {
  mockReview.mockResolvedValue('approved');
  await renderSession();
  await fireEvent.press(await screen.findByText('✓ Correct'));
  expect(mockReview).toHaveBeenCalledWith({ variantId: 'v1', verdict: 'ok', correctedArabic: null, correctedTransliteration: null, note: null });
  expect(await screen.findByText('Approved: all done — the word is live')).toBeOnTheScreen();
  expect(screen.getByText('more please')).toBeOnTheScreen();
});

it('Fix sends only what changed, with the note', async () => {
  await renderSession();
  await fireEvent.press(await screen.findByText('✎ Fix the spelling'));
  await fireEvent.changeText(screen.getByLabelText('Corrected transliteration'), 'kammelt');
  await fireEvent.changeText(screen.getByLabelText('Review note'), 'double m');
  await fireEvent.press(screen.getByText('Save fix and approve'));
  expect(mockReview).toHaveBeenCalledWith({
    variantId: 'v1', verdict: 'fix', correctedArabic: null, correctedTransliteration: 'kammelt', note: 'double m',
  });
});

it('Reject, with an optional note', async () => {
  await renderSession();
  await fireEvent.press(await screen.findByText('✗ Reject'));
  await fireEvent.press(screen.getByText('Reject this form'));
  expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'v1', verdict: 'reject', note: null }));
});

it('a refusal stays on the form and says why in plain words', async () => {
  mockReview.mockRejectedValue(new Error('bad_transliteration'));
  await renderSession();
  await fireEvent.press(await screen.findByText('✎ Fix the spelling'));
  await fireEvent.changeText(screen.getByLabelText('Corrected transliteration'), 'Kamelt!');
  await fireEvent.press(screen.getByText('Save fix and approve'));
  expect(await screen.findByText(/lowercase letters and numbers only/)).toBeOnTheScreen();
  expect(screen.getByText('all done')).toBeOnTheScreen();
});

it('already reviewed by someone else: skipped to the next form', async () => {
  mockReview.mockRejectedValue(new Error('already_reviewed'));
  await renderSession();
  await fireEvent.press(await screen.findByText('✓ Correct'));
  expect(await screen.findByText('more please')).toBeOnTheScreen();
});

it('not a reviewer: the database refuses, and it says so', async () => {
  mockReview.mockRejectedValue(new Error('permission denied: only language reviewers can review content'));
  await renderSession();
  await fireEvent.press(await screen.findByText('✓ Correct'));
  expect(await screen.findByText('Only language reviewers can approve or reject words.')).toBeOnTheScreen();
});

it('nothing waiting: "All reviewed"', async () => {
  mockFetch.mockResolvedValue([]);
  await renderSession();
  expect(await screen.findByText('All reviewed')).toBeOnTheScreen();
});
