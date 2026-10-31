// Practice → Speaking Practice: one card on the Practice tab opens a choice
// between the two speaking activities, which stay separate flows on their
// existing routes (/speaking-practice and /repeat-after-me).
import { fireEvent, render, screen } from '@testing-library/react-native';

declare const __dirname: string;

const mockPush = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticeTab = require('../../../app/(tabs)/practice').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SpeakingChoice = require('../../../app/speaking').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const themed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

beforeEach(() => mockPush.mockReset());

describe('Practice tab', () => {
  it('has one Speaking Practice card and no separate Repeat After Me card', async () => {
    await themed(<PracticeTab />);
    expect(screen.getAllByText('Speaking Practice')).toHaveLength(1);
    expect(screen.queryByText('Repeat After Me')).toBeNull();
  });

  it('the card opens the speaking choice screen', async () => {
    await themed(<PracticeTab />);
    await fireEvent.press(screen.getByText('Speaking Practice'));
    expect(mockPush).toHaveBeenCalledWith('/speaking');
  });

  it('the other Practice cards are still there', async () => {
    await themed(<PracticeTab />);
    for (const title of ['Phrasebook', 'Flashcards', 'Grammar Notes', 'Listening Practice', 'Alphabet Practice', 'Review', 'Culture Corner']) {
      expect(screen.getByText(title)).toBeOnTheScreen();
    }
  });
});

describe('Speaking choice screen', () => {
  it('offers both modes, each explained', async () => {
    await themed(<SpeakingChoice />);
    expect(screen.getByText('Speaking Practice')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Practice words/ })).toBeOnTheScreen();
    expect(screen.getByText(/your learning progress, favorites, or current lesson/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Repeat native recordings/ })).toBeOnTheScreen();
    expect(screen.getByText(/recordings chosen for Repeat After Me/i)).toBeOnTheScreen();
  });

  it('Practice words opens the existing Speaking Practice flow', async () => {
    await themed(<SpeakingChoice />);
    await fireEvent.press(screen.getByRole('button', { name: /Practice words/ }));
    expect(mockPush).toHaveBeenCalledWith('/speaking-practice');
  });

  it('Repeat native recordings opens the existing Repeat After Me flow', async () => {
    await themed(<SpeakingChoice />);
    await fireEvent.press(screen.getByRole('button', { name: /Repeat native recordings/ }));
    expect(mockPush).toHaveBeenCalledWith('/repeat-after-me');
  });
});

describe('existing routes stay', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { existsSync, readFileSync } = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('path');
  const app = join(__dirname, '..', '..', '..', 'app');

  it('/speaking-practice and /repeat-after-me still exist as their own screens', () => {
    expect(existsSync(join(app, 'speaking-practice.tsx'))).toBe(true);
    expect(existsSync(join(app, 'repeat-after-me.tsx'))).toBe(true);
  });

  it('Review still links straight to Speaking Practice', () => {
    expect(readFileSync(join(app, 'review.tsx'), 'utf8')).toMatch(/router\.replace\('\/speaking-practice'\)/);
  });
});
