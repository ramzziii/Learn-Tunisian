// Sign-in is unchanged by the adults-only onboarding; its "create an account"
// link now starts at the 18+ age gate instead of going straight to sign-up.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockReplace = jest.fn();
const mockLinks: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Text } = require('react-native');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn(), canGoBack: () => true },
    Link: ({ href, children }: { href: string; children: unknown }) => {
      mockLinks.push(href);
      return <Text>{children as string}</Text>;
    },
  };
});
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ signInWithEmail: (...a: unknown[]) => mockSignIn(...a) }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SignIn = require('../../../app/auth/sign-in').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderSignIn = () =>
  render(
    <ThemeProvider>
      <SignIn />
    </ThemeProvider>
  );

beforeEach(() => {
  mockSignIn.mockReset();
  mockReplace.mockReset();
  mockLinks.length = 0;
});

async function signIn(email: string, password: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), email);
  await fireEvent.changeText(screen.getByPlaceholderText('••••••••'), password);
  await fireEvent.press(screen.getAllByText('Sign in').slice(-1)[0]);
}

it('signs in with the trimmed email and goes to the app', async () => {
  mockSignIn.mockResolvedValue({ error: null });
  await renderSignIn();

  await signIn('  sam@example.com ', 'secret123');

  expect(mockSignIn).toHaveBeenCalledWith('sam@example.com', 'secret123');
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('a wrong password shows the error and stays here', async () => {
  mockSignIn.mockResolvedValue({ error: 'Invalid login credentials' });
  await renderSignIn();

  await signIn('sam@example.com', 'wrong');

  expect(await screen.findByText('Invalid login credentials')).toBeOnTheScreen();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('"create an account" starts at the age gate, not straight at sign-up', async () => {
  await renderSignIn();
  expect(mockLinks).toContain('/onboarding/age');
  expect(mockLinks).not.toContain('/auth/sign-up');
});
