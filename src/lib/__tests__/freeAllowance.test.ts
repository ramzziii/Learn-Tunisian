const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const allowance = require('@/lib/premium/freeAllowance');

beforeEach(() => {
  mockStore.clear();
  jest.useRealTimers();
});

describe('free daily review allowance', () => {
  it('is available until a review starts, then used for the rest of that day', async () => {
    expect(await allowance.hasUsedFreeReviewToday('p1')).toBe(false);
    await allowance.markFreeReviewStarted('p1');
    expect(await allowance.hasUsedFreeReviewToday('p1')).toBe(true);
  });

  it('resets the next local day', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 13, 21, 0));
    await allowance.markFreeReviewStarted('p1');
    jest.setSystemTime(new Date(2026, 9, 14, 8, 0));
    expect(await allowance.hasUsedFreeReviewToday('p1')).toBe(false);
  });

  it('is tracked per profile', async () => {
    await allowance.markFreeReviewStarted('p1');
    expect(await allowance.hasUsedFreeReviewToday('p2')).toBe(false);
  });
});

describe('Speed Match sample round', () => {
  it('is used once and stays used, independently of the review allowance', async () => {
    expect(await allowance.hasUsedSpeedMatchSample('p1')).toBe(false);
    await allowance.markFreeReviewStarted('p1');
    expect(await allowance.hasUsedSpeedMatchSample('p1')).toBe(false);
    await allowance.markSpeedMatchSampleUsed('p1');
    expect(await allowance.hasUsedSpeedMatchSample('p1')).toBe(true);
    expect(await allowance.hasUsedFreeReviewToday('p1')).toBe(true);
  });
});
