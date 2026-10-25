// Admin analytics overview: aggregates come only from the admin-guarded
// database function, and anything missing/malformed is an error — never a
// silently substituted zero.
const mockRpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchAnalyticsOverview, AnalyticsAccessDeniedError, ANALYTICS_PERIOD_DAYS } = require('@/data/admin/analytics');

const validPayload = () => ({
  period_start: '2026-09-25T00:00:00Z',
  period_end: '2026-10-25T00:00:00Z',
  period_days: 30,
  accounts_total: 120,
  accounts_new: 14,
  learner_profiles_total: 131,
  learner_profiles_new: 15,
  active_learners: 42,
  sessions_count: 310,
  minutes_learned: 1875,
  words_practiced: 2290,
  words_mastered_total: 980,
  countries: [
    { country: 'Tunisia', learners: 60 },
    { country: 'France', learners: 30 },
    { country: 'Other', learners: 9 },
    { country: 'Unknown', learners: 32 },
  ],
  country_min_group_size: 3,
});

beforeEach(() => mockRpc.mockReset());

it('offers 7, 30 and 90 day periods', () => {
  expect(ANALYTICS_PERIOD_DAYS).toEqual([7, 30, 90]);
});

it('asks the admin-only database function for the chosen period', async () => {
  mockRpc.mockResolvedValue({ data: validPayload(), error: null });

  await fetchAnalyticsOverview(30);

  expect(mockRpc).toHaveBeenCalledWith('admin_analytics_overview', { p_days: 30 });
});

it('maps the aggregates exactly as reported, with the period boundaries', async () => {
  mockRpc.mockResolvedValue({ data: validPayload(), error: null });

  const overview = await fetchAnalyticsOverview(30);

  expect(overview).toEqual({
    period: { start: '2026-09-25T00:00:00Z', end: '2026-10-25T00:00:00Z', days: 30 },
    learners: { accountsTotal: 120, accountsNew: 14, profilesTotal: 131, profilesNew: 15, activeLearners: 42 },
    learning: { sessions: 310, minutesLearned: 1875, wordsPracticed: 2290, wordsMasteredTotal: 980 },
    location: {
      minGroupSize: 3,
      countries: [
        { country: 'Tunisia', learners: 60 },
        { country: 'France', learners: 30 },
        { country: 'Other', learners: 9 },
        { country: 'Unknown', learners: 32 },
      ],
    },
  });
});

it('a real zero stays zero (e.g. no new sign-ups this week)', async () => {
  mockRpc.mockResolvedValue({ data: { ...validPayload(), accounts_new: 0, countries: [] }, error: null });

  const overview = await fetchAnalyticsOverview(7);

  expect(overview.learners.accountsNew).toBe(0);
  expect(overview.location.countries).toEqual([]);
});

it('rejects periods other than the supported ones (no ad-hoc date math)', async () => {
  await expect(fetchAnalyticsOverview(45)).rejects.toThrow(/period/i);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('a non-admin (or expired session) gets an access error, not numbers', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'not authorized', code: '42501' } });

  await expect(fetchAnalyticsOverview(30)).rejects.toBeInstanceOf(AnalyticsAccessDeniedError);
});

it('other query failures surface as errors', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'function admin_analytics_overview does not exist', code: '42883' } });

  await expect(fetchAnalyticsOverview(30)).rejects.toMatchObject({ code: '42883' });
});

it.each(['accounts_total', 'active_learners', 'minutes_learned', 'countries'])(
  'a missing or malformed "%s" is an error — never defaulted to zero',
  async (field) => {
    const payload: Record<string, unknown> = validPayload();
    delete payload[field];
    mockRpc.mockResolvedValue({ data: payload, error: null });

    await expect(fetchAnalyticsOverview(30)).rejects.toThrow(/analytics/i);
  }
);

it('a negative or non-numeric count is rejected as malformed', async () => {
  mockRpc.mockResolvedValue({ data: { ...validPayload(), sessions_count: 'lots' }, error: null });
  await expect(fetchAnalyticsOverview(30)).rejects.toThrow(/analytics/i);

  mockRpc.mockResolvedValue({ data: { ...validPayload(), sessions_count: -1 }, error: null });
  await expect(fetchAnalyticsOverview(30)).rejects.toThrow(/analytics/i);
});
