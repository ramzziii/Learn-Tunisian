// The analytics part of the admin dashboard: distinct loading / error /
// unavailable states, a period switch, and every number explained.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockFetch = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@/data/admin/analytics', () => {
  class AnalyticsAccessDeniedError extends Error {}
  return {
    ANALYTICS_PERIOD_DAYS: [7, 30, 90],
    AnalyticsAccessDeniedError,
    fetchAnalyticsOverview: (...a: unknown[]) => mockFetch(...a),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AnalyticsOverview } = require('@/components/admin/AnalyticsOverview');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AnalyticsAccessDeniedError } = require('@/data/admin/analytics');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const overview = (overrides: Record<string, unknown> = {}) => ({
  period: { start: '2026-09-25T00:00:00Z', end: '2026-10-25T00:00:00Z', days: 30 },
  learners: { accountsTotal: 120, accountsNew: 14, profilesTotal: 131, profilesNew: 15, activeLearners: 42 },
  learning: { sessions: 310, minutesLearned: 1875, wordsPracticed: 2290, wordsMasteredTotal: 980 },
  location: {
    minGroupSize: 3,
    countries: [
      { country: 'Tunisia', learners: 60 },
      { country: 'Other', learners: 9 },
    ],
  },
  ...overrides,
});

const renderOverview = () =>
  render(
    <ThemeProvider>
      <AnalyticsOverview />
    </ThemeProvider>
  );

beforeEach(() => mockFetch.mockReset());

it('defaults to the last 30 days and says exactly which days those are (UTC)', async () => {
  mockFetch.mockResolvedValue(overview());
  await renderOverview();

  expect(mockFetch).toHaveBeenCalledWith(30);
  expect(await screen.findByText(/Sep 25 – Oct 24, 2026 \(UTC\)/)).toBeOnTheScreen();
});

it('shows a loading state, distinct from data', async () => {
  mockFetch.mockReturnValue(new Promise(() => {}));
  await renderOverview();

  expect(screen.getByText(/Loading analytics/)).toBeOnTheScreen();
  expect(screen.queryByText('Registered users')).toBeNull();
});

it('reports each metric with its value and what it means', async () => {
  mockFetch.mockResolvedValue(overview());
  await renderOverview();

  expect(await screen.findByText('Registered users')).toBeOnTheScreen();
  expect(screen.getByText('120')).toBeOnTheScreen();
  expect(screen.getByText('14')).toBeOnTheScreen(); // new sign-ups
  expect(screen.getByText('42')).toBeOnTheScreen(); // active learners
  expect(screen.getByText('1,875')).toBeOnTheScreen(); // minutes
  expect(screen.getByText(/at least one lesson, review or Today.s Practice session/)).toBeOnTheScreen();
  expect(screen.getByText(/Admin accounts are excluded/)).toBeOnTheScreen();
});

it('switching period refetches for that period', async () => {
  mockFetch.mockResolvedValue(overview());
  await renderOverview();
  await screen.findByText('Registered users');

  mockFetch.mockResolvedValue(overview({ period: { start: '2026-10-18T00:00:00Z', end: '2026-10-25T00:00:00Z', days: 7 } }));
  await fireEvent.press(screen.getByText('7 days'));

  expect(mockFetch).toHaveBeenLastCalledWith(7);
  expect(await screen.findByText(/Oct 18 – Oct 24, 2026 \(UTC\)/)).toBeOnTheScreen();
});

it('learner locations are aggregate only, with the small-group rule stated', async () => {
  mockFetch.mockResolvedValue(overview());
  await renderOverview();

  expect(await screen.findByText('Tunisia')).toBeOnTheScreen();
  expect(screen.getByText('60')).toBeOnTheScreen();
  expect(screen.getByText(/fewer than 3 learners are grouped as “Other”/)).toBeOnTheScreen();
});

it('no location data → says so instead of an empty table', async () => {
  mockFetch.mockResolvedValue(overview({ location: { minGroupSize: 3, countries: [] } }));
  await renderOverview();

  expect(await screen.findByText(/No learner locations yet/)).toBeOnTheScreen();
});

it('Revenue and Marketing are "Not available yet" with what is needed — never a zero', async () => {
  mockFetch.mockResolvedValue(overview());
  await renderOverview();
  await screen.findByText('Registered users');

  expect(screen.getAllByText('Not available yet')).toHaveLength(2);
  expect(screen.getByText(/billing provider/i)).toBeOnTheScreen();
  expect(screen.getByText(/campaign|attribution/i)).toBeOnTheScreen();
});

it('a failed load shows an error with retry — and no numbers', async () => {
  mockFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(overview());
  await renderOverview();

  expect(await screen.findByText(/Couldn.t load analytics/)).toBeOnTheScreen();
  expect(screen.queryByText('120')).toBeNull();
  await fireEvent.press(screen.getByText('Try again'));
  expect(await screen.findByText('120')).toBeOnTheScreen();
});

it('access denied is explained as such (the database refused), not as a generic error', async () => {
  mockFetch.mockRejectedValue(new AnalyticsAccessDeniedError('not authorized'));
  await renderOverview();

  expect(await screen.findByText(/only available to admins/)).toBeOnTheScreen();
  expect(screen.queryByText('Try again')).toBeNull();
});

it('the analytics function not deployed yet → explains the missing migration', async () => {
  mockFetch.mockRejectedValue(Object.assign(new Error('function admin_analytics_overview does not exist'), { code: '42883' }));
  await renderOverview();

  expect(await screen.findByText(/0014_admin_analytics/)).toBeOnTheScreen();
});
