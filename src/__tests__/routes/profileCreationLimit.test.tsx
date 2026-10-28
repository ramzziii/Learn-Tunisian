// One learner profile per account, in the app's flows:
// - finishing onboarding creates the first profile and uses it;
// - a second profile is refused with a clear, recoverable message that leads
//   to the account's existing profile — nothing new is created;
// - an account that already has a profile can't re-enter the profile-setup
//   steps; Plans (reachable from settings) stays open;
// - the legacy chooser can't be used to switch once a profile is in use.
import { fireEvent, render, screen } from '@testing-library/react-native';

declare const __dirname: string;

const mockReplace = jest.fn();
const mockSubmit = jest.fn();
const mockReset = jest.fn();
const mockRefreshProfiles = jest.fn();
const mockSetActiveProfileId = jest.fn();
let mockSegments: string[] = ['onboarding', 'consent'];
let mockSession: { user: { id: string } } | null = { user: { id: 'acc-1' } };
let mockActive: {
  profiles: unknown[];
  activeProfile: unknown;
  isLoading: boolean;
} = { profiles: [], activeProfile: null, isLoading: false };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Text: RNText } = require('react-native');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    Redirect: ({ href }: { href: string }) => <RNText>{`Redirect:${href}`}</RNText>,
    Stack: () => <RNText>onboarding-stack</RNText>,
    useSegments: () => mockSegments,
  };
});
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, isLoading: false, signOut: jest.fn() }),
}));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({
    ...mockActive,
    refreshProfiles: (...a: unknown[]) => mockRefreshProfiles(...a),
    setActiveProfileId: (...a: unknown[]) => mockSetActiveProfileId(...a),
  }),
}));
jest.mock('@/lib/onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    state: { dailyGoalMinutes: 10, reminderHour: 18, reminderMinute: 0 },
    update: jest.fn(),
    submit: (...a: unknown[]) => mockSubmit(...a),
    reset: (...a: unknown[]) => mockReset(...a),
  }),
}));
jest.mock('@/components/onboarding/TimeWheelPicker', () => ({ TimeWheelPicker: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DailyGoalSetup = require('../../../app/onboarding/goal').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OnboardingLayout = require('../../../app/onboarding/_layout').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProfileChooser = require('../../../app/profiles/index').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProfileAlreadyExistsError } = require('@/lib/account/profileLimit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderThemed = (el: React.ReactElement) => render(<ThemeProvider>{el}</ThemeProvider>);

const profile = (id: string) => ({ id, accountId: 'acc-1', name: id, dateOfBirth: '1990-01-01' });

beforeEach(() => {
  [mockReplace, mockSubmit, mockReset, mockRefreshProfiles, mockSetActiveProfileId].forEach((m) => m.mockReset());
  mockSession = { user: { id: 'acc-1' } };
  mockSegments = ['onboarding', 'consent'];
  mockActive = { profiles: [], activeProfile: null, isLoading: false };
});

describe('finishing onboarding (daily goal step)', () => {
  it('creates the first profile, makes it the active one and goes home', async () => {
    mockSubmit.mockResolvedValue(profile('p1'));
    await renderThemed(<DailyGoalSetup />);

    await fireEvent.press(screen.getByText('Finish setup'));

    expect(mockSubmit).toHaveBeenCalledWith('acc-1');
    expect(mockSetActiveProfileId).toHaveBeenCalledWith('p1');
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('a second profile is refused with a clear message that leads to the existing profile', async () => {
    mockSubmit.mockRejectedValue(new ProfileAlreadyExistsError());
    await renderThemed(<DailyGoalSetup />);

    await fireEvent.press(screen.getByText('Finish setup'));

    expect(screen.getByText(/already has a learner profile/i)).toBeOnTheScreen();
    expect(mockSetActiveProfileId).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Continue to my profile'));
    expect(mockRefreshProfiles).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
    // Only the one attempt — nothing retries the creation.
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('other errors still show as a plain retryable error', async () => {
    mockSubmit.mockRejectedValue(new Error('Network request failed'));
    await renderThemed(<DailyGoalSetup />);

    await fireEvent.press(screen.getByText('Finish setup'));

    expect(screen.getByText('Network request failed')).toBeOnTheScreen();
    expect(screen.queryByText('Continue to my profile')).toBeNull();
  });
});

describe('onboarding routes for an account that already has a profile', () => {
  it.each([['age'], ['consent'], ['profile'], ['preferences'], ['goal']])(
    '/onboarding/%s sends it back to the app instead of setting up another profile',
    async (step) => {
      mockSegments = ['onboarding', step];
      mockActive = { profiles: [profile('p1')], activeProfile: profile('p1'), isLoading: false };
      await render(<OnboardingLayout />);

      expect(screen.getByText('Redirect:/')).toBeOnTheScreen();
    }
  );

  it('also for a legacy account with several profiles (the chooser handles it)', async () => {
    mockActive = { profiles: [profile('p1'), profile('p2')], activeProfile: null, isLoading: false };
    await render(<OnboardingLayout />);

    expect(screen.getByText('Redirect:/')).toBeOnTheScreen();
  });

  it('Plans stays reachable (it is opened from settings)', async () => {
    mockSegments = ['onboarding', 'plans'];
    mockActive = { profiles: [profile('p1')], activeProfile: profile('p1'), isLoading: false };
    await render(<OnboardingLayout />);

    expect(screen.getByText('onboarding-stack')).toBeOnTheScreen();
  });

  it('an account with no profile yet, or no one signed in, goes through onboarding normally', async () => {
    await render(<OnboardingLayout />);
    expect(screen.getByText('onboarding-stack')).toBeOnTheScreen();

    mockSession = null;
    mockSegments = ['onboarding', 'age'];
    await render(<OnboardingLayout />);
    expect(screen.getAllByText('onboarding-stack').length).toBeGreaterThan(0);
  });
});

describe('no profile switching', () => {
  it('the legacy chooser can’t be used to switch once a profile is in use', async () => {
    mockActive = { profiles: [profile('p1'), profile('p2')], activeProfile: profile('p1'), isLoading: false };
    await render(
      <ThemeProvider>
        <ProfileChooser />
      </ThemeProvider>
    );

    expect(screen.getByText('Redirect:/home')).toBeOnTheScreen();
    expect(screen.queryByText('p2')).toBeNull();
  });

  it('nothing in the app offers to add, create or switch profiles', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync, readdirSync, statSync } = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('path');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(join(__dirname, '../../../app'));
    const offenders = files.filter((f) =>
      /add (a|another) profile|(?<![-\w])new profile|choose which profile|switch profile/i.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);

    const profileTab = readFileSync(join(__dirname, '../../../app/(tabs)/profile.tsx'), 'utf8');
    expect(profileTab).not.toMatch(/['"]\/profiles['"]/);
  });
});
