// The access layer every screen asks: which tier this is, which items are
// already used, and "may I open this item?" (using one up if needed).
// - guest: device-only counts (no server calls);
// - free: counts on the server (claim_feature_item), so they survive
//   restarts, reinstalls and other devices; a failed server call is an
//   explicit error, never a silent "yes";
// - Premium: nothing counted;
// - an admin previewing the free plan uses a separate local count, so their
//   real counts (and entitlement) are never touched.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));

let mockSession: { user: { id: string } } | null = { user: { id: 'acc-1' } };
let mockPremium = { isPremium: false, isResolved: true, isAdmin: false, adminPreview: 'premium' };
let mockIsGuest = false;
const mockFetchClaims = jest.fn();
const mockClaimItem = jest.fn();

jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock('@/lib/premium/PremiumContext', () => ({ usePremium: () => mockPremium }));
jest.mock('@/lib/guest/GuestContext', () => ({ useGuest: () => ({ isGuest: mockIsGuest }) }));
const mockProfile = { activeProfile: { id: 'p1' } };
jest.mock('@/lib/account/ActiveProfileContext', () => ({ useActiveProfile: () => mockProfile }));
jest.mock('@/data/featureClaims', () => ({
  fetchMyClaims: (...a: unknown[]) => mockFetchClaims(...a),
  claimFeatureItem: (...a: unknown[]) => mockClaimItem(...a),
}));

const mockClearSearchIndex = jest.fn();
jest.mock('@/lib/search/searchIndexCache', () => ({ clearSearchIndex: () => mockClearSearchIndex() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AccessProvider, useAccess } = require('@/lib/access/AccessContext');

const wrapper = ({ children }: { children: ReactNode }) => <AccessProvider>{children}</AccessProvider>;
const renderAccess = async () => {
  const hook = await renderHook(() => useAccess(), { wrapper });
  await waitFor(() => expect(hook.result.current.isResolved).toBe(true));
  return hook;
};

beforeEach(() => {
  mockStore.clear();
  mockSession = { user: { id: 'acc-1' } };
  mockPremium = { isPremium: false, isResolved: true, isAdmin: false, adminPreview: 'premium' };
  mockIsGuest = false;
  mockFetchClaims.mockReset().mockResolvedValue({ lesson: ['l1', 'l2'] });
  mockClaimItem.mockReset().mockResolvedValue(true);
});

describe('free account (server counts)', () => {
  it('reads used items from the server and decides from them', async () => {
    const { result } = await renderAccess();
    expect(result.current.tier).toBe('free');
    expect(result.current.decide('lesson', 'l1')).toBe('open');
    expect(result.current.decide('lesson', 'l3')).toBe('claim');
  });

  it('opening a new item claims it on the server and it becomes "used" everywhere', async () => {
    const { result } = await renderAccess();
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await result.current.open('lesson', 'l3');
    });
    expect(allowed).toBe(true);
    expect(mockClaimItem).toHaveBeenCalledWith('lesson', 'l3');
    expect(result.current.decide('lesson', 'l3')).toBe('open');
  });

  it('at the limit: no server call, refused', async () => {
    mockFetchClaims.mockResolvedValue({ lesson: ['a', 'b', 'c', 'd', 'e'] });
    const { result } = await renderAccess();
    expect(result.current.decide('lesson', 'f')).toBe('limit');
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await result.current.open('lesson', 'f');
    });
    expect(allowed).toBe(false);
    expect(mockClaimItem).not.toHaveBeenCalled();
  });

  it('the server refusing (another device used the last one) is respected', async () => {
    mockClaimItem.mockResolvedValue(false);
    const { result } = await renderAccess();
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await result.current.open('lesson', 'l3');
    });
    expect(allowed).toBe(false);
  });

  it('a server error is an explicit error, never a silent "yes"', async () => {
    mockClaimItem.mockRejectedValue(new Error('Network request failed'));
    const { result } = await renderAccess();
    await expect(result.current.open('lesson', 'l3')).rejects.toThrow('Network request failed');
    expect(result.current.decide('lesson', 'l3')).toBe('claim');
  });

  it('a completed lesson opens without using an item', async () => {
    mockFetchClaims.mockResolvedValue({ lesson: ['a', 'b', 'c', 'd', 'e'] });
    const { result } = await renderAccess();
    expect(result.current.decide('lesson', 'z', { completed: true })).toBe('open');
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await result.current.open('lesson', 'z', { completed: true });
    });
    expect(allowed).toBe(true);
    expect(mockClaimItem).not.toHaveBeenCalled();
  });
});

describe('Premium', () => {
  it('everything open, nothing counted or fetched', async () => {
    mockPremium = { ...mockPremium, isPremium: true };
    const { result } = await renderAccess();
    expect(result.current.tier).toBe('premium');
    expect(result.current.decide('lesson', 'anything')).toBe('open');
    await act(async () => {
      await result.current.open('lesson', 'anything');
    });
    expect(mockClaimItem).not.toHaveBeenCalled();
  });
});

describe('guest (device only)', () => {
  it('2 items per feature on the device, no server calls at all', async () => {
    mockSession = null;
    mockIsGuest = true;
    const { result } = await renderAccess();
    expect(result.current.tier).toBe('guest');
    await act(async () => {
      expect(await result.current.open('proverb', 'a')).toBe(true);
      expect(await result.current.open('proverb', 'b')).toBe(true);
      expect(await result.current.open('proverb', 'c')).toBe(false);
    });
    expect(result.current.decide('proverb', 'a')).toBe('open');
    expect(mockFetchClaims).not.toHaveBeenCalled();
    expect(mockClaimItem).not.toHaveBeenCalled();
  });
});

describe('the in-memory search index', () => {
  it('is cleared on sign-out and whenever the tier changes (Premium refresh, preview toggle)', async () => {
    const hook = await renderAccess();
    mockClearSearchIndex.mockClear();

    mockPremium = { isPremium: true, isResolved: true, isAdmin: false, adminPreview: 'premium' };
    await hook.rerender(undefined);
    expect(mockClearSearchIndex).toHaveBeenCalled();

    mockClearSearchIndex.mockClear();
    mockSession = null;
    await hook.rerender(undefined);
    expect(mockClearSearchIndex).toHaveBeenCalled();
  });
});

describe('admin previewing the free plan', () => {
  beforeEach(() => {
    mockPremium = { isPremium: false, isResolved: true, isAdmin: true, adminPreview: 'free' };
  });

  it('uses a separate local count: no server claims, real counts untouched', async () => {
    const { result } = await renderAccess();
    expect(result.current.tier).toBe('free');
    expect(result.current.decide('lesson', 'l1')).toBe('claim'); // server's l1/l2 aren't the preview's
    await act(async () => {
      for (const k of ['a', 'b', 'c', 'd', 'e']) expect(await result.current.open('lesson', k)).toBe(true);
      expect(await result.current.open('lesson', 'f')).toBe(false);
    });
    expect(mockFetchClaims).not.toHaveBeenCalled();
    expect(mockClaimItem).not.toHaveBeenCalled();
  });

  it('acts like a new free account: the admin’s own completed lessons don’t reopen for free', async () => {
    const { result } = await renderAccess();
    expect(result.current.decide('lesson', 'done', { completed: true })).toBe('claim');
    await act(async () => {
      for (const k of ['a', 'b', 'c', 'd', 'e']) await result.current.open('lesson', k);
    });
    expect(result.current.decide('lesson', 'done', { completed: true })).toBe('limit');
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await result.current.open('lesson', 'done', { completed: true });
    });
    expect(allowed).toBe(false);
  });

  it('the admin can reset the preview counts — only the local preview, never the server', async () => {
    const { result } = await renderAccess();
    await act(async () => {
      for (const k of ['a', 'b', 'c', 'd', 'e']) await result.current.open('lesson', k);
    });
    expect(result.current.decide('lesson', 'f')).toBe('limit');
    await act(async () => {
      await result.current.resetPreview();
    });
    expect(result.current.decide('lesson', 'f')).toBe('claim');
    expect(mockClaimItem).not.toHaveBeenCalled();
  });

  it('reset does nothing outside the admin preview (a real free account keeps its counts)', async () => {
    mockPremium = { isPremium: false, isResolved: true, isAdmin: false, adminPreview: 'premium' };
    const { result } = await renderAccess();
    await act(async () => {
      await result.current.resetPreview();
    });
    expect(result.current.claimed('lesson')).toEqual(new Set(['l1', 'l2']));
  });

  it('switching the preview to Premium opens everything immediately', async () => {
    const hook = await renderAccess();
    expect(hook.result.current.tier).toBe('free');
    mockPremium = { isPremium: true, isResolved: true, isAdmin: true, adminPreview: 'premium' };
    await hook.rerender(undefined);
    expect(hook.result.current.tier).toBe('premium');
    expect(hook.result.current.decide('lesson', 'anything')).toBe('open');
  });
});
