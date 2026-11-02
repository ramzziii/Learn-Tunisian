// The word speaker used across the app. Placeholder audio (seeded
// text-to-speech in Modern Standard Arabic, is_native_voice = false) is a
// "computer voice", not Tunisian:
// - it reports where the sound comes from: 'native', 'computer' or null;
// - only a native recording ever autoplays; a computer voice plays only when
//   tapped (screens label it);
// - nativeOnly (listening and pronunciation exercises) never loads or plays a
//   computer voice;
// - the phone's own voice is never used in place of a recording.
import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { WordVariant } from '@/types/models';

const mockEnsureAudioCached = jest.fn();
const mockSpeak = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };

jest.mock('@/lib/offline/audioCache', () => ({
  ensureAudioCached: (...args: unknown[]) => mockEnsureAudioCached(...args),
}));
jest.mock('expo-speech', () => ({ speak: (...args: unknown[]) => mockSpeak(...args), stop: jest.fn() }));
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
    isNativeVoice: false,
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }) as WordVariant;

const settled = async (result: { current: { isResolving: boolean } }) =>
  waitFor(() => expect(result.current.isResolving).toBe(false));

beforeEach(() => {
  mockEnsureAudioCached.mockReset().mockResolvedValue('file:///cache/v1.m4a');
  mockSpeak.mockReset();
  Object.values(mockPlayer).forEach((fn) => fn.mockClear());
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('native recording', () => {
  it('plays, reports "native" and may autoplay', async () => {
    const v = variant({ isNativeVoice: true });
    const { result } = await renderHook(() => useWordAudioPlayer(v, { autoPlay: true }));
    await settled(result);
    expect(result.current.source).toBe('native');
    expect(result.current.hasAudio).toBe(true);
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///cache/v1.m4a' });
  });

  it('is used in native-only mode too', async () => {
    const v = variant({ isNativeVoice: true });
    const { result } = await renderHook(() => useWordAudioPlayer(v, { nativeOnly: true }));
    await settled(result);
    expect(result.current.source).toBe('native');
  });
});

describe('computer voice (placeholder text-to-speech file)', () => {
  it('reports "computer" and never autoplays', async () => {
    const v = variant();
    const { result } = await renderHook(() => useWordAudioPlayer(v, { autoPlay: true }));
    await settled(result);
    expect(result.current.source).toBe('computer');
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('plays when tapped', async () => {
    const v = variant();
    const { result } = await renderHook(() => useWordAudioPlayer(v));
    await settled(result);
    await act(async () => result.current.play());
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  it('native-only mode: not loaded, nothing to play', async () => {
    const v = variant();
    const { result } = await renderHook(() => useWordAudioPlayer(v, { autoPlay: true, nativeOnly: true }));
    await settled(result);
    expect(mockEnsureAudioCached).not.toHaveBeenCalled();
    expect(result.current.source).toBeNull();
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.hasError).toBe(false);
    await act(async () => result.current.play());
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });
});

describe('no playable recording', () => {
  it('no recording at all: nothing to play, no error, never the phone’s voice', async () => {
    const v = variant({ audioPath: null });
    const { result } = await renderHook(() => useWordAudioPlayer(v, { autoPlay: true }));
    await settled(result);
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.source).toBeNull();
    await act(async () => result.current.play());
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('a recording that fails to load: an error to retry, never the phone’s voice', async () => {
    mockEnsureAudioCached.mockResolvedValue(null);
    const v = variant({ isNativeVoice: true });
    const { result } = await renderHook(() => useWordAudioPlayer(v, { autoPlay: true }));
    await settled(result);
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.hasError).toBe(true);
    await act(async () => result.current.play());
    expect(mockSpeak).not.toHaveBeenCalled();
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });
});
