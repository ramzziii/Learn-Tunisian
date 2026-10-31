// Masculine and feminine forms are recorded separately: the station names
// the form being recorded and says the recording is for that form only.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSave = jest.fn();
const mockPlayer = { replace: jest.fn(), seekTo: jest.fn(async () => undefined), play: jest.fn() };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/lib/supabase/client', () => ({ getAudioUrl: (p: string | null) => (p ? `https://cdn/${p}` : null) }));
jest.mock('@/data/admin/recordingQueue', () => ({ saveQueueRecording: (...a: unknown[]) => mockSave(...a) }));
jest.mock('@/hooks/useAdminAudioRecorder', () => ({
  useAdminAudioRecorder: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useState } = require('react');
    const [isRecording, setIsRecording] = useState(false);
    return {
      permission: 'ready',
      isRecording,
      durationMillis: 1500,
      requestPermission: jest.fn(),
      start: async () => setIsRecording(true),
      stop: async () => {
        setIsRecording(false);
        return 'file:///take.m4a';
      },
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RecordingStation } = require('@/components/admin/RecordingStation');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const item = (variantLabel: string) => ({
  variant: { id: `v-${variantLabel}`, wordGroupId: 'tired', variantLabel, wordArabic: 'تعبان', transliteration: 'ta3ban', audioPath: null, explanationAudioPath: null },
  englishMeaning: 'tired',
  unitName: 'Feelings',
  lessonNumber: 1,
  reason: 'no_audio',
});

const renderStation = (variantLabel: string) =>
  render(
    <ThemeProvider>
      <RecordingStation item={item(variantLabel)} actorAccountId="admin-1" onSaved={jest.fn()} onSkip={jest.fn()} />
    </ThemeProvider>
  );

it.each([
  ['masculine', 'Masculine form'],
  ['feminine', 'Feminine form'],
])('a %s variant is labelled “%s”, with a note that it has its own recording', async (variantLabel, label) => {
  await renderStation(variantLabel);
  expect(screen.getByText(label)).toBeOnTheScreen();
  expect(screen.getByText(/this form only/i)).toBeOnTheScreen();
});

it('a one-form word is not labelled as a form', async () => {
  await renderStation('primary');
  expect(screen.queryByText(/masculine form|feminine form/i)).toBeNull();
  expect(screen.queryByText(/this form only/i)).toBeNull();
});
