// Adults-only onboarding: Welcome → date-of-birth age gate → create account →
// Terms & Privacy consent → profile setup → daily goal. The date of birth is
// asked once, kept in memory only, and never saved or sent for an under-18.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockSignUp = jest.fn();
let mockSession: { user: { id: string } } | null = null;
let mockProfiles: unknown[] = [];

const mockCreateProfile = jest.fn();
const mockCreateDailyGoal = jest.fn();
const mockRecordConsent = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockSupabaseRpc = jest.fn();
const mockSetItem = jest.fn(async () => undefined);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: (...a: unknown[]) => mockSetItem(...(a as [])) },
}));
// The password field's show/hide eye icon loads a font asset Jest can't serve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Text: RNText } = require('react-native');
  return {
    router: {
      push: (...a: unknown[]) => mockPush(...a),
      replace: (...a: unknown[]) => mockReplace(...a),
      back: jest.fn(),
      canGoBack: () => true,
    },
    Redirect: ({ href }: { href: string }) => <RNText>{`Redirect:${href}`}</RNText>,
    Link: ({ children }: { children: unknown }) => <RNText>{children as string}</RNText>,
  };
});
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (...a: unknown[]) => mockSupabaseFrom(...a),
    rpc: (...a: unknown[]) => mockSupabaseRpc(...a),
  },
}));
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    session: mockSession,
    isLoading: false,
    signOut: (...a: unknown[]) => mockSignOut(...a),
    signUpWithEmail: (...a: unknown[]) => mockSignUp(...a),
  }),
}));
jest.mock('@/lib/account/ActiveProfileContext', () => ({
  useActiveProfile: () => ({ profiles: mockProfiles, activeProfile: null, isLoading: false, setActiveProfileId: jest.fn() }),
}));
jest.mock('@/data/profiles', () => ({
  createProfile: (...a: unknown[]) => mockCreateProfile(...a),
  createDailyGoalSettings: (...a: unknown[]) => mockCreateDailyGoal(...a),
}));
jest.mock('@/data/consent', () => ({ recordConsent: (...a: unknown[]) => mockRecordConsent(...a) }));
const mockSaveDisplay = jest.fn(async () => undefined);
jest.mock('@/data/displayPreferences', () => ({
  saveDisplayPreferences: (...a: unknown[]) => (mockSaveDisplay as jest.Mock)(...a),
  fetchDisplayPreferences: jest.fn(async () => ({ script: 'both', form: 'both' })),
}));
jest.mock('@/lib/notifications/reminders', () => ({
  requestNotificationPermission: jest.fn(async () => false),
  scheduleDailyReminder: jest.fn(),
}));
// The native date picker is replaced by a plain text input so tests can type a date.
jest.mock('@/components/onboarding/DateOfBirthField', () => ({
  DateOfBirthField: ({ value, onChange }: { value: string | null; onChange: (v: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text: RNText, TextInput: RNTextInput } = require('react-native');
    return (
      <>
        <RNText>{`DOB picker: ${value ?? 'empty'}`}</RNText>
        <RNTextInput testID="dob-input" onChangeText={onChange} />
      </>
    );
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OnboardingProvider, useOnboarding } = require('@/lib/onboarding/OnboardingContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dateToIsoDate, formatDateOfBirth } = require('@/lib/age');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AgeGate = require('../../../app/onboarding/age').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SignUp = require('../../../app/auth/sign-up').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProfileSetup = require('../../../app/onboarding/profile').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Preferences = require('../../../app/onboarding/preferences').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Consent = require('../../../app/onboarding/consent').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Index = require('../../../app/index').default;

const yearsAgo = (years: number, dayOffset = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return dateToIsoDate(d);
};

type Captured = { state: Record<string, unknown>; submit: (id: string) => Promise<unknown>; update: (p: object) => void };
let onboarding: Captured;
function Probe() {
  const ctx = useOnboarding();
  onboarding = ctx;
  return <Text>{`state dob=${ctx.state.dateOfBirth ?? 'none'} consent=${ctx.state.consentGiven}`}</Text>;
}
function Seed({ patch }: { patch: object }) {
  const { update } = useOnboarding();
  useEffect(() => {
    update(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const renderWith = (el: React.ReactElement, seed?: object) =>
  render(
    <ThemeProvider>
      <OnboardingProvider>
        {seed ? <Seed patch={seed} /> : null}
        {el}
        <Probe />
      </OnboardingProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  [mockPush, mockReplace, mockSignOut, mockSignUp, mockCreateProfile, mockCreateDailyGoal, mockRecordConsent, mockSupabaseFrom, mockSupabaseRpc, mockSetItem].forEach((m) => m.mockReset());
  mockSession = null;
  mockProfiles = [];
  mockCreateProfile.mockImplementation(async (input: Record<string, unknown>) => ({ id: 'p1', ...input }));
  mockCreateDailyGoal.mockResolvedValue({});
  mockRecordConsent.mockResolvedValue({});
});

describe('age gate (signed out, before an account exists)', () => {
  it('explains the app is 18+ and that the date is self-declared', async () => {
    await renderWith(<AgeGate />);
    expect(screen.getByText(/18 or older/)).toBeOnTheScreen();
    expect(screen.queryByText(/verif/i)).toBeNull(); // never claims to verify age
  });

  it('an adult continues to account creation, with the date kept only in onboarding memory', async () => {
    const dob = yearsAgo(18);
    await renderWith(<AgeGate />);

    await fireEvent.changeText(screen.getByTestId('dob-input'), dob);
    await fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText(`state dob=${dob} consent=false`)).toBeOnTheScreen();
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-up');
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('someone one day short of 18 sees the adults-only message and cannot go on — nothing saved or sent', async () => {
    const logSpies = (['log', 'info', 'warn', 'error'] as const).map((k) => jest.spyOn(console, k).mockImplementation(() => {}));
    const dob = yearsAgo(18, 1);
    await renderWith(<AgeGate />);

    await fireEvent.changeText(screen.getByTestId('dob-input'), dob);
    await fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText(/only for adults/i)).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('state dob=none consent=false')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockSupabaseRpc).not.toHaveBeenCalled();
    for (const spy of logSpies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(dob);
      spy.mockRestore();
    }
  });
});

describe('age gate (signed in, resuming onboarding after the in-memory date was lost)', () => {
  beforeEach(() => {
    mockSession = { user: { id: 'acc-1' } };
  });

  it('an adult goes back to profile setup, keeping consent already given', async () => {
    await renderWith(<AgeGate />, { consentGiven: true });

    await fireEvent.changeText(screen.getByTestId('dob-input'), yearsAgo(30));
    await fireEvent.press(screen.getByText('Continue'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/profile');
    expect(mockPush).not.toHaveBeenCalledWith('/auth/sign-up');
    expect(screen.getByText(/consent=true/)).toBeOnTheScreen();
  });

  it('an under-18 sees the message with a way to sign out, and nothing is saved', async () => {
    await renderWith(<AgeGate />);

    await fireEvent.changeText(screen.getByTestId('dob-input'), yearsAgo(16));
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(screen.getByText('Sign out'));

    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByText(/state dob=none/)).toBeOnTheScreen();
    expect(mockCreateProfile).not.toHaveBeenCalled();
  });
});

describe('account creation needs the age gate first', () => {
  it('without a date of birth in onboarding, sign-up sends you to the age gate', async () => {
    await renderWith(<SignUp />);
    expect(screen.getByText('Redirect:/onboarding/age')).toBeOnTheScreen();
  });

  it('with an adult date of birth, the sign-up form shows (and asks nothing about age)', async () => {
    await renderWith(<SignUp />, { dateOfBirth: yearsAgo(25) });
    expect(screen.getByPlaceholderText(/you@example\.com/)).toBeOnTheScreen();
    expect(screen.queryByText(/DOB picker/)).toBeNull();
  });
});

describe('profile setup reuses the date already entered', () => {
  it('shows the date read-only, with no second date picker', async () => {
    const dob = yearsAgo(30);
    await renderWith(<ProfileSetup />, { dateOfBirth: dob });

    expect(screen.getByText(formatDateOfBirth(dob))).toBeOnTheScreen();
    expect(screen.queryByText(/DOB picker/)).toBeNull();
    expect(screen.getByPlaceholderText('Your name')).toBeOnTheScreen();
  });

  it('if the date was lost (app restarted after sign-up), it sends you back to the age gate instead of asking here', async () => {
    await renderWith(<ProfileSetup />);

    expect(screen.queryByText(/DOB picker/)).toBeNull();
    await fireEvent.press(screen.getByText('Confirm your date of birth'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/age');
  });

  it('preferences include the optional learning goal and can be finished without one', async () => {
    await renderWith(<Preferences />, { nativeLanguage: 'English', country: 'United States' });

    expect(screen.getByText(/learning goal \(optional\)/i)).toBeOnTheScreen();
    expect(screen.getByText('Travel')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/goal');
  });
});

describe('consent step', () => {
  it('has no parent/guardian wording and continues to profile setup once agreed', async () => {
    await renderWith(<Consent />);

    expect(screen.queryByText(/parent|guardian|child/i)).toBeNull();
    await fireEvent.press(screen.getByText(/I have read and agree/));
    await fireEvent.press(screen.getByText('Agree and continue'));
    expect(screen.getByText(/consent=true/)).toBeOnTheScreen();
    expect(mockPush).toHaveBeenCalledWith('/onboarding/profile');
  });
});

describe('finishing onboarding (submit)', () => {
  const full = {
    consentGiven: true,
    name: 'Sam',
    dateOfBirth: '1990-05-05',
    nativeLanguage: 'English',
    country: 'United States',
    startingProficiency: 'none',
    learningGoal: null,
  };

  it('creates the profile with the date entered at the age gate, then records adult consent', async () => {
    await renderWith(<></>, full);
    await act(async () => {
      await onboarding.submit('acc-1');
    });

    expect(mockCreateProfile).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', dateOfBirth: '1990-05-05', name: 'Sam' }));
    expect(mockRecordConsent).toHaveBeenCalledWith('acc-1', 'p1');
    expect(mockCreateDailyGoal).toHaveBeenCalled();
  });

  it('refuses without consent, and refuses an under-18 date — creating nothing', async () => {
    await renderWith(<></>, { ...full, consentGiven: false });
    await expect(onboarding.submit('acc-1')).rejects.toThrow(/consent/i);

    await act(async () => onboarding.update({ consentGiven: true, dateOfBirth: yearsAgo(17) }));
    await expect(onboarding.submit('acc-1')).rejects.toThrow(/18/);

    expect(mockCreateProfile).not.toHaveBeenCalled();
    expect(mockRecordConsent).not.toHaveBeenCalled();
  });
});

describe('app entry routing', () => {
  it('a signed-in account with no profile yet goes to the consent step (no "who is this for?")', async () => {
    mockSession = { user: { id: 'acc-1' } };
    await render(<Index />);
    expect(screen.getByText('Redirect:/onboarding/consent')).toBeOnTheScreen();
  });

  it('signed out goes to Welcome', async () => {
    await render(<Index />);
    expect(screen.getByText('Redirect:/welcome')).toBeOnTheScreen();
  });
});

// Keeps TextInput referenced for the type import above.
void TextInput;

describe('which form to practice by default', () => {
  it('asks once, with the explanation, defaulting to Show both — and never asks the learner’s gender', async () => {
    await renderWith(<Preferences />, { nativeLanguage: 'English', country: 'United States' });

    expect(screen.getByText('Which form would you like to practice by default?')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Some Tunisian Arabic words and phrases change depending on the form used. This choice controls which form we show first; it does not define your gender.'
      )
    ).toBeOnTheScreen();
    for (const label of ['Masculine', 'Feminine', 'Show both']) {
      expect(screen.getByRole('radio', { name: label })).toBeOnTheScreen();
    }
    expect(screen.getByRole('radio', { name: 'Show both' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByText(/what is your gender|are you (male|female|a man|a woman)/i)).toBeNull();
  });

  it('the choice is kept in onboarding state', async () => {
    await renderWith(<Preferences />, { nativeLanguage: 'English', country: 'United States' });
    await fireEvent.press(screen.getByRole('radio', { name: 'Feminine' }));
    expect(onboarding.state.formPreference).toBe('feminine');
    expect(screen.getByRole('radio', { name: 'Feminine' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  const full = {
    consentGiven: true,
    name: 'Sam',
    dateOfBirth: '1990-05-05',
    nativeLanguage: 'English',
    country: 'United States',
    startingProficiency: 'none',
    learningGoal: null,
  };

  it('is saved as a display preference for the new profile when onboarding finishes', async () => {
    mockSaveDisplay.mockClear();
    await renderWith(<></>, { ...full, formPreference: 'masculine' });
    await act(async () => {
      await onboarding.submit('acc-1');
    });
    expect(mockSaveDisplay).toHaveBeenCalledWith('p1', { script: 'both', form: 'masculine' });
  });

  it('left at Show both: nothing needs saving (no row means both/both)', async () => {
    mockSaveDisplay.mockClear();
    await renderWith(<></>, full);
    await act(async () => {
      await onboarding.submit('acc-1');
    });
    expect(mockSaveDisplay).not.toHaveBeenCalled();
  });

  it('if saving it fails, the account is still set up (it can be changed in Settings)', async () => {
    mockSaveDisplay.mockClear();
    mockSaveDisplay.mockRejectedValueOnce(new Error('offline') as never);
    await renderWith(<></>, { ...full, formPreference: 'feminine' });
    let profile: unknown;
    await act(async () => {
      profile = await onboarding.submit('acc-1');
    });
    expect(profile).toMatchObject({ id: 'p1' });
    expect(mockCreateDailyGoal).toHaveBeenCalled();
  });
});
