// The guest preview's data lives only on this device: which items were used
// (at most 2 per feature), practice results per word, and favorites. It can
// be read back for carry-over and cleared afterwards. Nothing here touches
// the network.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));
const mockFetch = jest.fn();
(globalThis as unknown as { fetch: unknown }).fetch = mockFetch;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guest = require('@/lib/guest/guestStore');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GUEST_DATA_STORAGE_KEY } = require('@/lib/localStorageKeys');

beforeEach(() => {
  mockStore.clear();
  mockFetch.mockReset();
});

it('starts empty', async () => {
  expect(await guest.getGuestData()).toEqual({ claims: {}, results: {}, favorites: [] });
});

it('claims: 2 per feature, then refused; re-claiming a used item is fine', async () => {
  expect(await guest.claimGuestItem('grammar_note', 'a')).toBe(true);
  expect(await guest.claimGuestItem('grammar_note', 'b')).toBe(true);
  expect(await guest.claimGuestItem('grammar_note', 'c')).toBe(false);
  expect(await guest.claimGuestItem('grammar_note', 'a')).toBe(true);
  expect(await guest.claimGuestItem('proverb', 'p1')).toBe(true); // other features are separate
  expect((await guest.getGuestData()).claims).toEqual({ grammar_note: ['a', 'b'], proverb: ['p1'] });
});

it('practice results are counted per word', async () => {
  await guest.recordGuestResult('w1', true);
  await guest.recordGuestResult('w1', false);
  await guest.recordGuestResult('w2', true);
  const { results } = await guest.getGuestData();
  expect(results.w1).toMatchObject({ correct: 1, incorrect: 1 });
  expect(results.w2).toMatchObject({ correct: 1, incorrect: 0 });
});

it('favorites toggle on and off', async () => {
  expect(await guest.toggleGuestFavorite('w1')).toBe(true);
  expect(await guest.toggleGuestFavorite('w2')).toBe(true);
  expect(await guest.toggleGuestFavorite('w1')).toBe(false);
  expect((await guest.getGuestData()).favorites).toEqual(['w2']);
});

it('clearGuestData removes everything', async () => {
  await guest.claimGuestItem('lesson', 'l1');
  await guest.clearGuestData();
  expect(mockStore.has(GUEST_DATA_STORAGE_KEY)).toBe(false);
  expect(await guest.getGuestData()).toEqual({ claims: {}, results: {}, favorites: [] });
});

it('a corrupt value reads as empty', async () => {
  mockStore.set(GUEST_DATA_STORAGE_KEY, '{nope');
  expect(await guest.getGuestData()).toEqual({ claims: {}, results: {}, favorites: [] });
});

it('never uses the network', async () => {
  await guest.claimGuestItem('lesson', 'l1');
  await guest.recordGuestResult('w1', true);
  await guest.toggleGuestFavorite('w1');
  expect(mockFetch).not.toHaveBeenCalled();
});

it('claimsForImport: at most 2 per feature, as the server function expects', async () => {
  await guest.claimGuestItem('lesson', 'l1');
  await guest.claimGuestItem('lesson', 'l2');
  await guest.claimGuestItem('proverb', 'p1');
  await guest.claimGuestItem('dictionary_result', 'w1'); // device only — never imported
  expect(guest.claimsForImport(await guest.getGuestData())).toEqual([
    { feature: 'lesson', item_key: 'l1' },
    { feature: 'lesson', item_key: 'l2' },
    { feature: 'proverb', item_key: 'p1' },
  ]);
});
