// The speaker button every exercise uses ("Listen, then record yourself
// saying it", listen-and-tap, …): it must always make a sound when there's
// something to say — the uploaded recording if it's playable, otherwise the
// on-device voice — never a dead or endlessly-retrying button.
import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { WordVariant } from '@/types/models';

const mockEnsureAudioCached = jest.fn();
const mockSpeak = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };

jest.mock('@/lib/offline/audioCache', () => ({
  ensureAudioCached: (...args: unknown[]) => mockEnsureAudioCached(...args),
}));
jest.mock('expo-speech', () => ({ speak: (...args: unknown[]) => mockSpeak(...args) }));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useWordAudioPlayer } = require('@/hooks/useWordAudioPlayer');

const variant = (overrides: Partial<WordVariant> = {}) =>
  ({
    id: 'v1',
    wordArabic: 'الحساب من فضلك',
    audioPath: 'food_dining/pb_food_bill_please.m4a',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }) as WordVariant;

beforeEach(() => {
  mockEnsureAudioCached.mockReset();
  mockSpeak.mockReset();
  Object.values(mockPlayer).forEach((fn) => fn.mockClear());
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it('recording missing from Storage: the speaker still works, using the on-device voice', async () => {
  mockEnsureAudioCached.mockResolvedValue(null);
  const v = variant();
  const { result } = await renderHook(() => useWordAudioPlayer(v));
  await waitFor(() => expect(result.current.isResolving).toBe(false));

  expect(result.current.hasAudio).toBe(true);
  expect(result.current.hasError).toBe(false); // no retry loop on a file that will never exist
  expect(result.current.isFallbackVoice).toBe(true);

  await act(async () => result.current.play());
  expect(mockSpeak).toHaveBeenCalledWith('الحساب من فضلك', expect.objectContaining({ language: 'ar' }));
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

it('auto-plays the fallback voice too, so "listen then record" starts with the word', async () => {
  mockEnsureAudioCached.mockResolvedValue(null);
  const v = variant();
  await renderHook(() => useWordAudioPlayer(v, { autoPlay: true }));

  await waitFor(() => expect(mockSpeak).toHaveBeenCalledWith('الحساب من فضلك', expect.anything()));
});

it('no recording uploaded at all (null audio_path): still speaks the word', async () => {
  mockEnsureAudioCached.mockResolvedValue(null);
  const v = variant({ audioPath: null });
  const { result } = await renderHook(() => useWordAudioPlayer(v));
  await waitFor(() => expect(result.current.isResolving).toBe(false));

  await act(async () => result.current.play());
  expect(mockSpeak).toHaveBeenCalled();
});

it('a playable recording is always preferred over the device voice', async () => {
  mockEnsureAudioCached.mockResolvedValue('file:///cache/v1.m4a');
  const v = variant();
  const { result } = await renderHook(() => useWordAudioPlayer(v));
  await waitFor(() => expect(result.current.isResolving).toBe(false));

  expect(result.current.isFallbackVoice).toBe(false);
  await act(async () => result.current.play());
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/v1.m4a' });
  expect(mockPlayer.play).toHaveBeenCalled();
  expect(mockSpeak).not.toHaveBeenCalled();
});

it('nothing to say and the recording failed: reports an error so the UI offers a retry', async () => {
  mockEnsureAudioCached.mockResolvedValue(null);
  const v = variant({ wordArabic: '' });
  const { result } = await renderHook(() => useWordAudioPlayer(v));
  await waitFor(() => expect(result.current.isResolving).toBe(false));

  expect(result.current.hasAudio).toBe(false);
  expect(result.current.hasError).toBe(true);
});

it('fallbackVoice: false (Repeat After Me) — a missing recording is an error to retry, never the device voice', async () => {
  mockEnsureAudioCached.mockResolvedValue(null);
  const v = variant();
  const { result } = await renderHook(() => useWordAudioPlayer(v, { autoPlay: true, fallbackVoice: false }));
  await waitFor(() => expect(result.current.isResolving).toBe(false));

  expect(result.current.hasAudio).toBe(false);
  expect(result.current.hasError).toBe(true);
  expect(result.current.isFallbackVoice).toBe(false);
  await act(async () => result.current.play());
  expect(mockSpeak).not.toHaveBeenCalled();
});
