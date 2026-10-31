// The age gate with the typed date fields (no mock of the field): an adult
// date goes on to account creation; an under-18 date shows the adults-only
// message and is not stored, logged or sent anywhere; a partial or invalid
// date can't be submitted.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { dateToIsoDate } from '@/lib/age';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockSupabaseRpc = jest.fn();
const mockSupabaseInvoke = jest.fn();
const mockSetItem = jest.fn(async () => undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: (...a: unknown[]) => mockSetItem(...(a as [])) },
}));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (...a: unknown[]) => mockSupabaseFrom(...a),
    rpc: (...a: unknown[]) => mockSupabaseRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockSupabaseInvoke(...a) },
  },
}));
jest.mock('@/lib/notifications/reminders', () => ({ scheduleDailyReminder: jest.fn() }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: null, isLoading: false, signOut: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AgeGate = require('../../../app/onboarding/age').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OnboardingProvider, useOnboarding } = require('@/lib/onboarding/OnboardingContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

function Probe() {
  const { state } = useOnboarding();
  return <Text>{`stored dob=${state.dateOfBirth ?? 'none'}`}</Text>;
}

const renderGate = () =>
  render(
    <ThemeProvider>
      <OnboardingProvider>
        <AgeGate />
        <Probe />
      </OnboardingProvider>
    </ThemeProvider>
  );

async function typeDate(d: Date) {
  await fireEvent.changeText(screen.getByLabelText('Birth month, two digits'), String(d.getMonth() + 1).padStart(2, '0'));
  await fireEvent.changeText(screen.getByLabelText('Birth day, two digits'), String(d.getDate()).padStart(2, '0'));
  await fireEvent.changeText(screen.getByLabelText('Birth year, four digits'), String(d.getFullYear()));
}

const yearsAgo = (years: number, dayOffset = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return d;
};

let consoleSpies: jest.SpyInstance[];
beforeEach(() => {
  [mockPush, mockReplace, mockSupabaseFrom, mockSupabaseRpc, mockSupabaseInvoke, mockSetItem].forEach((m) => m.mockClear());
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => consoleSpies.forEach((s) => s.mockRestore()));

it('Continue stays disabled until the date is complete and valid', async () => {
  await renderGate();
  const cont = () => screen.getByRole('button', { name: 'Continue' });
  expect(cont()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Birth month, two digits'), '04');
  await fireEvent.changeText(screen.getByLabelText('Birth day, two digits'), '31');
  await fireEvent.changeText(screen.getByLabelText('Birth year, four digits'), '1990');
  expect(cont()).toBeDisabled(); // 31 April doesn't exist
});

it('exactly 18 today: continues to account creation', async () => {
  await renderGate();
  await typeDate(yearsAgo(18));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

  expect(mockPush).toHaveBeenCalledWith('/auth/sign-up');
  expect(screen.getByText(`stored dob=${dateToIsoDate(yearsAgo(18))}`)).toBeOnTheScreen();
});

it('one day short of 18: adults-only message, nothing stored, logged or sent, no signup', async () => {
  await renderGate();
  const under = yearsAgo(18, 1);
  await typeDate(under);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

  expect(screen.getByText(/only for adults/i)).toBeOnTheScreen();
  expect(screen.getByText('stored dob=none')).toBeOnTheScreen();
  expect(mockPush).not.toHaveBeenCalledWith('/auth/sign-up');
  expect(mockSupabaseFrom).not.toHaveBeenCalled();
  expect(mockSupabaseRpc).not.toHaveBeenCalled();
  expect(mockSupabaseInvoke).not.toHaveBeenCalled();
  expect(mockSetItem).not.toHaveBeenCalled();
  const iso = dateToIsoDate(under);
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(iso);
  }
});

it('the date-entry screen is the first of six onboarding steps', async () => {
  await renderGate();
  expect(screen.getByText('When were you born?')).toBeOnTheScreen();
  expect(screen.getByLabelText('Step 1 of 6')).toBeOnTheScreen();
});
