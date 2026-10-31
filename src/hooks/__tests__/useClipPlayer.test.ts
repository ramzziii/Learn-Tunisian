// The listening quiz's answer-clip player (src/hooks/useClipPlayer.ts):
// one expo-audio player for all options, so only one clip ever plays;
// downloaded clips come from the offline cache; a clip that can't be
// resolved (offline, nothing downloaded) is marked unavailable with a retry
// — it is never replaced by device or AI speech.
import { act, renderHook } from '@testing-library/react-native';

import { makeVariant } from '@/test-utils/wordGroupFixtures';

const mockEnsureAudioCached = jest.fn();
const mockSpeak = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn(), pause: jest.fn() };

jest.mock('@/lib/offline/audioCache', () => ({
  ensureAudioCached: (...args: unknown[]) => mockEnsureAudioCached(...args),
}));
jest.mock('expo-speech', () => ({ speak: (...args: unknown[]) => mockSpeak(...args) }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false, didJustFinish: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useClipPlayer } = require('@/hooks/useClipPlayer');

const a = makeVariant('a', { listenable: true });
const b = makeVariant('b', { listenable: true });

beforeEach(() => {
  mockEnsureAudioCached.mockReset();
  mockSpeak.mockReset();
  Object.values(mockPlayer).forEach((fn) => fn.mockClear());
});

it('plays a clip from the cache (works offline once downloaded)', async () => {
  mockEnsureAudioCached.mockResolvedValue('file:///cache/a.m4a');
  const { result } = await renderHook(() => useClipPlayer());

  await act(async () => result.current.play('opt-a', a));

  expect(mockEnsureAudioCached).toHaveBeenCalledWith(a);
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/a.m4a' });
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(result.current.activeKey).toBe('opt-a');
});

it('starting another clip stops the current one — only one plays at a time', async () => {
  mockEnsureAudioCached.mockImplementation(async (v: { id: string }) => `file:///cache/${v.id}.m4a`);
  const { result } = await renderHook(() => useClipPlayer());

  await act(async () => result.current.play('opt-a', a));
  await act(async () => result.current.play('opt-b', b));

  // One shared player: replacing its source stops the previous clip.
  expect(mockPlayer.replace).toHaveBeenLastCalledWith({ uri: `file:///cache/${b.id}.m4a` });
  expect(result.current.activeKey).toBe('opt-b');
});

it('a slow clip that resolves after a newer tap never takes over', async () => {
  let resolveA: (uri: string) => void = () => {};
  mockEnsureAudioCached.mockImplementation((v: { id: string }) =>
    v.id === a.id ? new Promise((r) => (resolveA = r)) : Promise.resolve(`file:///cache/${v.id}.m4a`)
  );
  const { result } = await renderHook(() => useClipPlayer());

  let first: Promise<void> = Promise.resolve();
  // Start A without waiting for it: its lookup stays pending.
  await act(async () => {
    first = result.current.play('opt-a', a);
  });
  await act(async () => result.current.play('opt-b', b));
  await act(async () => {
    resolveA('file:///cache/a-late.m4a');
    await first;
  });

  expect(mockPlayer.replace).not.toHaveBeenCalledWith({ uri: 'file:///cache/a-late.m4a' });
  expect(result.current.activeKey).toBe('opt-b');
});

it('replay restarts the same clip from the beginning', async () => {
  mockEnsureAudioCached.mockResolvedValue('file:///cache/a.m4a');
  const { result } = await renderHook(() => useClipPlayer());

  await act(async () => result.current.play('opt-a', a));
  await act(async () => result.current.play('opt-a', a));

  expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
});

it('offline with the clip not downloaded: marked unavailable, never spoken by the device', async () => {
  mockEnsureAudioCached.mockResolvedValue(null);
  const { result } = await renderHook(() => useClipPlayer());

  await act(async () => result.current.play('opt-a', a));

  expect(result.current.isUnavailable('opt-a')).toBe(true);
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  expect(mockSpeak).not.toHaveBeenCalled();
  expect(result.current.activeKey).toBeNull();
});

it('retrying an unavailable clip tries again and clears the state once it loads', async () => {
  mockEnsureAudioCached.mockResolvedValueOnce(null).mockResolvedValueOnce('file:///cache/a.m4a');
  const { result } = await renderHook(() => useClipPlayer());

  await act(async () => result.current.play('opt-a', a));
  expect(result.current.isUnavailable('opt-a')).toBe(true);

  await act(async () => result.current.play('opt-a', a));
  expect(result.current.isUnavailable('opt-a')).toBe(false);
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/a.m4a' });
});

it('a lookup error is treated as unavailable, not a crash', async () => {
  mockEnsureAudioCached.mockRejectedValue(new Error('disk full'));
  const { result } = await renderHook(() => useClipPlayer());
  await act(async () => result.current.play('opt-a', a));
  expect(result.current.isUnavailable('opt-a')).toBe(true);
});
