// The letters an alphabet activity (practice round, Speed Match) may use:
// Premium → all; otherwise the letters already opened, topped up in teaching
// order (each one counted) when there are fewer than the activity needs. If
// the allowance can't reach that many, nothing is claimed and it's 'limit'.
import { renderHook, waitFor } from '@testing-library/react-native';

import { ARABIC_LETTERS } from '@/lib/alphabet';

let mockTier: 'guest' | 'free' | 'premium' = 'free';
let mockClaimed: string[] = [];
const mockOpen = jest.fn(async (_f: string, key: string) => {
  mockClaimed = [...mockClaimed, key];
  return true;
});
jest.mock('@/lib/access/AccessContext', () => ({
  useAccess: () => ({
    tier: mockTier,
    isResolved: true,
    open: mockOpen,
    claimed: () => new Set(mockClaimed),
    decide: (_f: string, key: string) =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/lib/access/accessRules').decideItemAccess({ tier: mockTier, claimed: new Set(mockClaimed), itemKey: key }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useOpenLetterPool } = require('@/lib/access/useOpenLetterPool');

beforeEach(() => {
  mockTier = 'free';
  mockClaimed = [];
  mockOpen.mockClear();
});

const ids = (letters: { id: string }[]) => letters.map((l) => l.id);

it('Premium: every letter, nothing counted', async () => {
  mockTier = 'premium';
  const { result } = await renderHook(() => useOpenLetterPool(3));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.letters).toHaveLength(ARABIC_LETTERS.length);
  expect(mockOpen).not.toHaveBeenCalled();
});

it('free with no letters opened: opens the first 3 in teaching order', async () => {
  const { result } = await renderHook(() => useOpenLetterPool(3));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(ids(result.current.letters)).toEqual(ARABIC_LETTERS.slice(0, 3).map((l) => l.id));
  expect(mockOpen.mock.calls.map((c) => c[1])).toEqual(ARABIC_LETTERS.slice(0, 3).map((l) => l.id));
});

it('free with enough letters opened: uses exactly those, counts nothing', async () => {
  mockClaimed = [ARABIC_LETTERS[10].id, ARABIC_LETTERS[12].id, ARABIC_LETTERS[20].id, ARABIC_LETTERS[5].id];
  const { result } = await renderHook(() => useOpenLetterPool(3));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(ids(result.current.letters).sort()).toEqual([...mockClaimed].sort());
  expect(mockOpen).not.toHaveBeenCalled();
});

it('guest needing 3 (Speed Match): limit, and nothing is claimed', async () => {
  mockTier = 'guest';
  const { result } = await renderHook(() => useOpenLetterPool(3));
  await waitFor(() => expect(result.current.status).toBe('limit'));
  expect(mockOpen).not.toHaveBeenCalled();
});

it('guest needing 2 (practice): opens 2', async () => {
  mockTier = 'guest';
  const { result } = await renderHook(() => useOpenLetterPool(2));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.letters).toHaveLength(2);
});

it('if opening fails (offline): error, never extra letters', async () => {
  mockOpen.mockRejectedValueOnce(new Error('offline'));
  const { result } = await renderHook(() => useOpenLetterPool(3));
  await waitFor(() => expect(result.current.status).toBe('error'));
});
