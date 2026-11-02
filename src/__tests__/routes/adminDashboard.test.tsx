// Admin dashboard: analytics overview and content operations kept separate;
// existing content metrics and every operational link still work.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockFetchMetrics = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => true } }));
jest.mock('@/data/admin/metrics', () => ({ fetchAdminMetrics: (...a: unknown[]) => mockFetchMetrics(...a) }));
const mockFetchProgress = jest.fn();
jest.mock('@/data/admin/contentProgress', () => ({ fetchContentProgress: (...a: unknown[]) => mockFetchProgress(...a) }));
jest.mock('@/components/admin/AnalyticsOverview', () => ({
  AnalyticsOverview: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return <Text>[analytics overview]</Text>;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdminDashboard = require('../../../app/admin/index').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const metrics = {
  unitCount: 4,
  lessonCount: 12,
  wordGroupCount: 80,
  wordVariantCount: 95,
  wordGroupsByStatus: { draft: 3, pending_review: 2, approved: 75, rejected: 0, archived: 0 },
  pendingCorrectionsCount: 6,
};

const renderDashboard = () =>
  render(
    <ThemeProvider>
      <AdminDashboard />
    </ThemeProvider>
  );

const progress = {
  overall: { words: 300, approved: 150, withNativeAudio: 60, awaitingReview: 140 },
  units: [
    { unitId: 'u1', name: 'Greetings & Politeness', isPhrasebook: false, words: 28, approved: 14, withNativeAudio: 7, awaitingReview: 14 },
    { unitId: 'pb', name: 'Shopping', isPhrasebook: true, words: 10, approved: 10, withNativeAudio: 0, awaitingReview: 0 },
  ],
  needsRecording: [
    { variantId: 'v1', wordGroupId: 'welcome', variantLabel: 'feminine', englishMeaning: 'Welcome', unitName: 'Greetings & Politeness' },
    { variantId: 'v2', wordGroupId: 'pb_hi', variantLabel: 'primary', englishMeaning: 'Hi', unitName: 'Shopping' },
  ],
};

beforeEach(() => {
  mockPush.mockReset();
  mockFetchMetrics.mockReset().mockResolvedValue(metrics);
  mockFetchProgress.mockReset().mockResolvedValue(progress);
});

describe('content progress', () => {
  it('overall: words, approved %, native audio %, awaiting review', async () => {
    await renderDashboard();
    expect(await screen.findByText('Content progress')).toBeOnTheScreen();
    expect(screen.getByText('300 words · 50% approved · 20% with native audio · 140 awaiting review')).toBeOnTheScreen();
  });

  it('per unit, Phrasebook categories marked', async () => {
    await renderDashboard();
    expect(await screen.findByText('Greetings & Politeness')).toBeOnTheScreen();
    expect(screen.getByText('28 words · 50% approved · 25% with native audio · 14 awaiting review')).toBeOnTheScreen();
    expect(screen.getByText('Shopping (Phrasebook)')).toBeOnTheScreen();
  });

  it('lists words that need a recording, with a link to Native Recordings', async () => {
    await renderDashboard();
    expect(await screen.findByText('Needs recording (2)')).toBeOnTheScreen();
    expect(screen.getByText('Welcome — feminine (Greetings & Politeness)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Record them in Native Recordings'));
    expect(mockPush).toHaveBeenCalledWith('/admin/recordings');
  });

  it('a failed load says so (never zeros) and keeps everything else', async () => {
    mockFetchProgress.mockRejectedValue(new Error('network'));
    await renderDashboard();
    expect(await screen.findByText(/Couldn.t load content progress/)).toBeOnTheScreen();
    expect(screen.getByText('Approval Queue')).toBeOnTheScreen();
  });
});

it('has an Analytics section and a separate Content operations section', async () => {
  await renderDashboard();

  expect(screen.getByText('Analytics')).toBeOnTheScreen();
  expect(screen.getByText('[analytics overview]')).toBeOnTheScreen();
  expect(screen.getByText('Content operations')).toBeOnTheScreen();
});

it('keeps the existing content metrics', async () => {
  await renderDashboard();

  expect(await screen.findByText('Word groups')).toBeOnTheScreen();
  expect(screen.getByText('80')).toBeOnTheScreen();
  expect(screen.getByText('5')).toBeOnTheScreen(); // needs attention = draft + pending
  expect(screen.getByText('Corrections pending')).toBeOnTheScreen();
});

it.each([
  ['Content', '/admin/units'],
  ['Approval Queue', '/admin/queue'],
  ['Correction Review', '/admin/corrections'],
  ['Native Recordings', '/admin/recordings'],
  ['Skipped Recordings', '/admin/recordings-skipped'],
  ['Translation Requests', '/admin/translation-requests'],
])('"%s" still opens %s', async (title, href) => {
  await renderDashboard();

  await fireEvent.press(screen.getByText(title));

  expect(mockPush).toHaveBeenCalledWith(href);
});

it('content metrics failing doesn’t hide the operational links', async () => {
  mockFetchMetrics.mockRejectedValue(new Error('network'));
  await renderDashboard();

  expect(await screen.findByText(/Couldn.t load metrics/)).toBeOnTheScreen();
  expect(screen.getByText('Approval Queue')).toBeOnTheScreen();
});
