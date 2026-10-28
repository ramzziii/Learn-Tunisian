// One profile per account. A normal account's single profile is used
// automatically (no chooser, no switcher, no "add a profile"). An account
// that already has several profiles from an earlier version picks one on a
// one-time chooser — nothing is merged, rewritten or deleted.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockListProfiles = jest.fn();
const mockGetItem = jest.fn();
const mockSetItem = jest.fn(async () => undefined);
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'acc-1' } };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...a: unknown[]) => mockGetItem(...a),
    setItem: (...a: unknown[]) => mockSetItem(...(a as [])),
  },
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Text: RNText } = require('react-native');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => true },
    Redirect: ({ href }: { href: string }) => <RNText>{`Redirect:${href}`}</RNText>,
  };
});
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ session: mockSession, isLoading: false, signOut: jest.fn() }),
}));
jest.mock('@/data/profiles', () => ({ listProfiles: (...a: unknown[]) => mockListProfiles(...a) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ActiveProfileProvider, useActiveProfile } = require('@/lib/account/ActiveProfileContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Index = require('../../../app/index').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProfileChooser = require('../../../app/profiles/index').default;

const profile = (id: string, name: string) => ({
  id,
  accountId: 'acc-1',
  name,
  dateOfBirth: '1990-01-01',
  nativeLanguage: 'English',
  country: 'United States',
  startingProficiency: 'none',
  learningGoal: null,
  isPremium: false,
  createdAt: '2026-01-01T00:00:00Z',
});

function ActiveName() {
  const { activeProfile, profiles, isLoading } = useActiveProfile();
  if (isLoading) return <Text>loading</Text>;
  return <Text>{`active=${activeProfile?.id ?? 'none'} count=${profiles.length}`}</Text>;
}

const renderWithProvider = (el: React.ReactElement) =>
  render(
    <ThemeProvider>
      <ActiveProfileProvider>
        {el}
        <ActiveName />
      </ActiveProfileProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  [mockListProfiles, mockGetItem, mockSetItem, mockReplace, mockPush].forEach((m) => m.mockReset());
  mockGetItem.mockResolvedValue(null);
  mockSession = { user: { id: 'acc-1' } };
});

describe('an account with exactly one profile', () => {
  it('uses it automatically, without a chooser', async () => {
    mockListProfiles.mockResolvedValue([profile('p1', 'Sam')]);
    await renderWithProvider(<Index />);

    expect(await screen.findByText('active=p1 count=1')).toBeOnTheScreen();
    expect(screen.getByText('Redirect:/home')).toBeOnTheScreen();
  });

  it('the chooser screen just sends it home', async () => {
    mockListProfiles.mockResolvedValue([profile('p1', 'Sam')]);
    await renderWithProvider(<ProfileChooser />);

    expect(await screen.findByText('Redirect:/home')).toBeOnTheScreen();
  });
});

describe('an existing account with several profiles (from an earlier version)', () => {
  const several = [profile('p1', 'Sam'), profile('p2', 'Lina'), profile('p3', 'Omar')];

  it('does not silently pick one: entry goes to the one-time chooser', async () => {
    mockListProfiles.mockResolvedValue(several);
    await renderWithProvider(<Index />);

    expect(await screen.findByText('active=none count=3')).toBeOnTheScreen();
    expect(screen.getByText('Redirect:/profiles')).toBeOnTheScreen();
  });

  it('a previously chosen profile is remembered', async () => {
    mockListProfiles.mockResolvedValue(several);
    mockGetItem.mockResolvedValue('p2');
    await renderWithProvider(<Index />);

    expect(await screen.findByText('active=p2 count=3')).toBeOnTheScreen();
    expect(screen.getByText('Redirect:/home')).toBeOnTheScreen();
  });

  it('the chooser lists every profile, explains nothing is deleted, and offers no "add a profile"', async () => {
    mockListProfiles.mockResolvedValue(several);
    await renderWithProvider(<ProfileChooser />);

    expect(await screen.findByText('Sam')).toBeOnTheScreen();
    expect(screen.getByText('Lina')).toBeOnTheScreen();
    expect(screen.getByText('Omar')).toBeOnTheScreen();
    expect(screen.getByText(/kept as they are/i)).toBeOnTheScreen();
    expect(screen.queryByText(/add a profile|add another profile/i)).toBeNull();
    expect(screen.queryByText(/kid|child|track/i)).toBeNull();
  });

  it('choosing one makes it the account’s profile and goes home — the others are untouched', async () => {
    mockListProfiles.mockResolvedValue(several);
    await renderWithProvider(<ProfileChooser />);

    await fireEvent.press(await screen.findByText('Lina'));

    expect(mockSetItem).toHaveBeenCalledWith('learn-tunisian.active-profile-id', 'p2');
    expect(mockReplace).toHaveBeenCalledWith('/home');
    expect(screen.getByText('active=p2 count=3')).toBeOnTheScreen();
  });
});

it('the profile created at the end of onboarding becomes the active one as soon as profiles refresh', async () => {
  mockListProfiles.mockResolvedValueOnce([]);
  function Refresh() {
    const { refreshProfiles } = useActiveProfile();
    return <Text onPress={() => refreshProfiles()}>refresh</Text>;
  }
  await renderWithProvider(<Refresh />);
  expect(await screen.findByText('active=none count=0')).toBeOnTheScreen();

  mockListProfiles.mockResolvedValueOnce([profile('p1', 'Sam')]);
  await fireEvent.press(screen.getByText('refresh'));

  expect(await screen.findByText('active=p1 count=1')).toBeOnTheScreen();
});

it('an account with no profile goes to onboarding (consent), not a chooser', async () => {
  mockListProfiles.mockResolvedValue([]);
  await renderWithProvider(<Index />);

  expect(await screen.findByText('Redirect:/onboarding/consent')).toBeOnTheScreen();
  await act(async () => {});
});
