// The age retry block: after an under-18 date of birth (or a guest saying
// they're not 18 or older), this device can't retry the age gate or the
// guest preview for a cooling-off period. Only a yes/no flag and when it ends
// are stored — never the date that was typed. Reinstalling resets it, which
// is accepted.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const block = require('@/lib/age/retryBlock');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AGE_RETRY_BLOCK_STORAGE_KEY } = require('@/lib/localStorageKeys');

const NOW = new Date(2026, 9, 31, 10, 0);
const hours = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000);

beforeEach(() => mockStore.clear());

it('the cooling-off period is one constant, 24 hours by default', () => {
  expect(block.AGE_RETRY_BLOCK_HOURS).toBe(24);
});

it('not blocked until something sets it', async () => {
  expect(await block.isAgeRetryBlocked(NOW)).toBe(false);
});

it('blocked right after, and still just before the period ends', async () => {
  await block.blockAgeRetry(NOW);
  expect(await block.isAgeRetryBlocked(NOW)).toBe(true);
  expect(await block.isAgeRetryBlocked(hours(23.9))).toBe(true);
});

it('clears itself once the period is over', async () => {
  await block.blockAgeRetry(NOW);
  expect(await block.isAgeRetryBlocked(hours(24))).toBe(false);
  expect(mockStore.has(AGE_RETRY_BLOCK_STORAGE_KEY)).toBe(false);
});

it('stores only the flag and when it ends — no date of birth, nothing else', async () => {
  await block.blockAgeRetry(NOW);
  const saved = JSON.parse(mockStore.get(AGE_RETRY_BLOCK_STORAGE_KEY)!);
  expect(Object.keys(saved).sort()).toEqual(['blocked', 'until']);
  expect(saved.blocked).toBe(true);
  expect(new Date(saved.until).getTime()).toBe(hours(24).getTime());
});

it('a corrupt or unreadable value counts as not blocked (and is cleared)', async () => {
  mockStore.set(AGE_RETRY_BLOCK_STORAGE_KEY, 'not json');
  expect(await block.isAgeRetryBlocked(NOW)).toBe(false);
});
