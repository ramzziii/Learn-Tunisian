// The last two signup steps:
// - Daily goal: "How much time do you want to commit…?" — 5, 10 or 15
//   minutes only (10 pre-selected), then on to the reminder step. Nothing is
//   created and no permission is asked here.
// - Optional reminder: pick a time and "Set reminder" (notification
//   permission is asked only then), or "Not now" — signup finishes either way.
//   A denied permission is explained and signup can still finish.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefreshProfiles = jest.fn(async () => undefined);
const mockSetActiveProfileId = jest.fn(async () => undefined);
const mockCreateProfile = jest.fn();
const mockCreateDailyGoal = jest.fn(async () => undefined);
const mockPermission = jest.fn();
const mockSchedule = jest.fn(async () => undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'acc-1' } }, isLoading: false, signOut: jest.fn() }),
}));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({
    profiles: [],
    activeProfile: null,
    isLoading: false,
    refreshProfiles: (...a: unknown[]) => mockRefreshProfiles(...(a as [])),
    setActiveProfileId: (...a: unknown[]) => mockSetActiveProfileId(...(a as [])),
  }),
}));
jest.mock('@/data/profiles', () => ({
  createProfile: (...a: unknown[]) => mockCreateProfile(...a),
  createDailyGoalSettings: (...a: unknown[]) => mockCreateDailyGoal(...(a as [])),
}));
jest.mock('@/data/consent', () => ({ recordConsent: jest.fn(async () => undefined) }));
jest.mock('@/data/displayPreferences', () => ({ saveDisplayPreferences: jest.fn(async () => undefined) }));
jest.mock('@/lib/notifications/reminders', () => ({
  requestNotificationPermission: (...a: unknown[]) => mockPermission(...a),
  scheduleDailyReminder: (...a: unknown[]) => mockSchedule(...(a as [])),
}));
jest.mock('@/components/onboarding/TimeWheelPicker', () => ({
  TimeWheelPicker: ({ onChange }: { onChange: (h: number, m: number) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable onPress={() => onChange(7, 30)}>
        <Text>[pick 7:30]</Text>
      </Pressable>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoalStep = require('../../../app/onboarding/goal').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReminderStep = require('../../../app/onboarding/reminder').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OnboardingProvider, useOnboarding } = require('@/lib/onboarding/OnboardingContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

// Everything the earlier steps would have filled in.
const READY = {
  consentGiven: true,
  name: 'Sam',
  dateOfBirth: '1990-05-05',
  nativeLanguage: 'English',
  country: 'United States',
  startingProficiency: 'none',
};

let onboarding: { state: Record<string, unknown> };
function Probe() {
  onboarding = useOnboarding();
  return null;
}
function Seed({ values }: { values: Record<string, unknown> }) {
  const { update } = useOnboarding();
  useEffect(() => update(values), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const renderStep = (el: React.ReactElement, seed: Record<string, unknown> = READY) =>
  render(
    <ThemeProvider>
      <OnboardingProvider>
        <Seed values={seed} />
        <Probe />
        {el}
      </OnboardingProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  [mockPush, mockReplace, mockRefreshProfiles, mockSetActiveProfileId, mockCreateProfile, mockCreateDailyGoal, mockPermission, mockSchedule].forEach(
    (m) => m.mockClear()
  );
  mockCreateProfile.mockReset();
  mockCreateProfile.mockResolvedValue({ id: 'p1' });
  mockPermission.mockReset();
});

describe('daily goal step', () => {
  it('asks how much time to commit, offering 5, 10 or 15 minutes with 10 pre-selected', async () => {
    await renderStep(<GoalStep />);

    expect(screen.getByText('How much time do you want to commit to learning Tunisian each day?')).toBeOnTheScreen();
    for (const m of [5, 10, 15]) expect(screen.getByRole('radio', { name: new RegExp(`^${m} minutes a day`) })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^10 minutes a day/ })).toBeSelected();
    expect(screen.getByLabelText('Step 5 of 6')).toBeOnTheScreen();
  });

  it('saves the choice and continues to the reminder step — nothing is created or asked yet', async () => {
    await renderStep(<GoalStep />);
    await fireEvent.press(screen.getByRole('radio', { name: /^15 minutes a day/ }));
    expect(onboarding.state.dailyGoalMinutes).toBe(15);

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/reminder');
    expect(mockPermission).not.toHaveBeenCalled();
    expect(mockCreateProfile).not.toHaveBeenCalled();
  });

  it('has no reminder time on it any more', async () => {
    await renderStep(<GoalStep />);
    expect(screen.queryByText('[pick 7:30]')).toBeNull();
  });
});

describe('optional reminder step', () => {
  it('offers to set a daily reminder, or skip it', async () => {
    await renderStep(<ReminderStep />);
    expect(screen.getByText('Set a daily reminder')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 6 of 6')).toBeOnTheScreen();
  });

  it('Not now finishes signup with no permission request and nothing scheduled', async () => {
    await renderStep(<ReminderStep />, { ...READY, dailyGoalMinutes: 15 });
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(mockPermission).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCreateDailyGoal).toHaveBeenCalledWith('p1', 15, '18:00:00', false);
    expect(mockSetActiveProfileId).toHaveBeenCalledWith('p1');
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('Set reminder asks for permission once, saves the time and schedules it', async () => {
    mockPermission.mockResolvedValue(true);
    await renderStep(<ReminderStep />);
    await fireEvent.press(screen.getByText('[pick 7:30]'));
    await fireEvent.press(screen.getByRole('button', { name: 'Set reminder' }));

    expect(mockPermission).toHaveBeenCalledTimes(1);
    expect(mockCreateDailyGoal).toHaveBeenCalledWith('p1', 10, '07:30:00', true);
    expect(mockSchedule).toHaveBeenCalledWith('p1', '7:30');
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('a denied permission is explained, and signup can still finish without a reminder', async () => {
    mockPermission.mockResolvedValue(false);
    await renderStep(<ReminderStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Set reminder' }));

    expect(screen.getByText(/notifications are turned off/i)).toBeOnTheScreen();
    expect(mockCreateProfile).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Finish without a reminder' }));
    expect(mockCreateDailyGoal).toHaveBeenCalledWith('p1', 10, '18:00:00', false);
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('a failed signup shows the error and can be retried', async () => {
    mockCreateProfile.mockRejectedValueOnce(new Error('Network request failed'));
    await renderStep(<ReminderStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.getByText('Network request failed')).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});

describe('goal values', () => {
  it('never offers 30- or 60-minute goals', async () => {
    await renderStep(<GoalStep />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByText(/30 minutes|60 minutes/)).toBeNull();
  });

  it('a goal outside 5 / 10 / 15 is refused at signup — nothing is created', async () => {
    await renderStep(<ReminderStep />, { ...READY, dailyGoalMinutes: 30 });
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(mockCreateProfile).not.toHaveBeenCalled();
    expect(mockCreateDailyGoal).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
