// Forgot password (signed out): emails a 6-digit code and goes straight to
// entering it.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockSendPasswordReset = jest.fn();
const mockReplace = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ sendPasswordReset: (...a: unknown[]) => mockSendPasswordReset(...a) }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForgotPassword = require('../../../app/auth/forgot-password').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

beforeEach(() => {
  mockSendPasswordReset.mockReset().mockResolvedValue({ error: null });
  mockReplace.mockReset();
});

const renderScreen = () =>
  render(
    <ThemeProvider>
      <ForgotPassword />
    </ThemeProvider>
  );

it('sends a code to the entered email, then opens the code screen for it', async () => {
  await renderScreen();

  expect(screen.getByText(/6-digit code/)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), ' ramzi@example.com ');
  await fireEvent.press(screen.getByText('Send code'));

  expect(mockSendPasswordReset).toHaveBeenCalledWith('ramzi@example.com');
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/auth/reset-code', params: { email: 'ramzi@example.com' } });
});

it('a failed request shows the error and stays here', async () => {
  mockSendPasswordReset.mockResolvedValue({ error: 'Email rate limit exceeded' });
  await renderScreen();

  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'ramzi@example.com');
  await fireEvent.press(screen.getByText('Send code'));

  expect(await screen.findByText(/Email rate limit exceeded/)).toBeOnTheScreen();
  expect(mockReplace).not.toHaveBeenCalled();
});
