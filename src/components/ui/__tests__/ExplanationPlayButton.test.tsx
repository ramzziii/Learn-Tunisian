// "Play explanation": a separate, never-auto-playing control for a native
// speaker's spoken explanation — hidden entirely when there is none.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/lib/supabase/client', () => ({
  getAudioUrl: (p: string | null, v?: string) => (p ? `https://cdn/audio/${p}?v=${v}` : null),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ExplanationPlayButton } = require('@/components/ui/ExplanationPlayButton');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderButton = (variant: unknown) =>
  render(
    <ThemeProvider>
      <ExplanationPlayButton variant={variant} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockPlayer.replace.mockClear();
  mockPlayer.seekTo.mockClear().mockResolvedValue(undefined);
  mockPlayer.play.mockClear();
});

it('renders nothing when there is no explanation (no broken control)', async () => {
  await renderButton({ explanationAudioPath: null, updatedAt: 'x' });
  expect(screen.queryByText(/explanation/i)).toBeNull();
  await renderButton(null);
  expect(screen.queryByText(/explanation/i)).toBeNull();
});

it('never auto-plays; plays the explanation file (not the pronunciation) on tap', async () => {
  await renderButton({ audioPath: 'g1/v1-1.m4a', explanationAudioPath: 'g1/v1-explanation-2.m4a', updatedAt: '2026-10-01' });

  expect(mockPlayer.play).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Play explanation'));

  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://cdn/audio/g1/v1-explanation-2.m4a?v=2026-10-01' });
  expect(mockPlayer.play).toHaveBeenCalled();
});

it('a playback failure says so (and can be tried again)', async () => {
  mockPlayer.seekTo.mockRejectedValueOnce(new Error('file missing'));
  await renderButton({ explanationAudioPath: 'g1/v1-explanation-2.m4a', updatedAt: 'x' });

  await fireEvent.press(screen.getByText('Play explanation'));
  expect(await screen.findByText(/Couldn.t play the explanation/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Play explanation'));
  expect(mockPlayer.play).toHaveBeenCalled();
});
