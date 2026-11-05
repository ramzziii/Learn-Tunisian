// Data access for free sample items: read this account's used items (RLS
// returns only its own) and claim through the server function, which applies
// the cap. Errors are thrown, never turned into a "yes".
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
const mockRpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ supabase: { ...mockDb.client, rpc: (...a: unknown[]) => mockRpc(...a) } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchMyClaims, claimFeatureItem, importGuestClaims } = require('@/data/featureClaims');

beforeEach(() => {
  mockDb.reset();
  mockRpc.mockReset();
});

it('groups this account’s used items by feature', async () => {
  mockDb.respond('feature_item_claims.select', {
    data: [
      { feature: 'lesson', item_key: 'l1' },
      { feature: 'lesson', item_key: 'l2' },
      { feature: 'proverb', item_key: 'p1' },
    ],
    error: null,
  });
  expect(await fetchMyClaims()).toEqual({ lesson: ['l1', 'l2'], proverb: ['p1'] });
});

it('a read error is thrown', async () => {
  mockDb.respond('feature_item_claims.select', { data: null, error: { message: 'boom' } });
  await expect(fetchMyClaims()).rejects.toEqual({ message: 'boom' });
});

it('claims through claim_feature_item and returns its answer', async () => {
  mockRpc.mockResolvedValue({ data: false, error: null });
  expect(await claimFeatureItem('lesson', 'l3')).toBe(false);
  expect(mockRpc).toHaveBeenCalledWith('claim_feature_item', { p_feature: 'lesson', p_item_key: 'l3' });
});

it('a claim error is thrown, not treated as allowed', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
  await expect(claimFeatureItem('lesson', 'l3')).rejects.toEqual({ message: 'Network request failed' });
});

it('imports guest items through import_guest_feature_items', async () => {
  mockRpc.mockResolvedValue({ data: 2, error: null });
  const items = [{ feature: 'lesson', item_key: 'l1' }];
  expect(await importGuestClaims(items)).toBe(2);
  expect(mockRpc).toHaveBeenCalledWith('import_guest_feature_items', { p_items: items });
});

it('no guest items → no call', async () => {
  expect(await importGuestClaims([])).toBe(0);
  expect(mockRpc).not.toHaveBeenCalled();
});
