// /auth/reset-code: enter the 6-digit code from the reset email and a new
// password — no email link involved, so it works in Expo Go and in any
// email app.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockVerify = jest.fn();
const mockUpdatePassword = jest.fn();
const mockSendPasswordReset = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { email: 'ramzi@example.com' };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
// The password fields' show/hide eye icon loads a font asset Jest can't serve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    verifyPasswordResetCode: (...a: unknown[]) => mockVerify(...a),
    updatePassword: (...a: unknown[]) => mockUpdatePassword(...a),
    sendPasswordReset: (...a: unknown[]) => mockSendPasswordReset(...a),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ResetCode = require('../../../app/auth/reset-code').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ThemeProvider } = require('@/lib/theme/ThemeContext');

const renderScreen = () =>
  render(
    <ThemeProvider>
      <ResetCode />
    </ThemeProvider>
  );

async function fill({
  code = '123456',
  password = 'newpass1',
  confirm = password,
}: { code?: string; password?: string; confirm?: string } = {}) {
  await fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), code);
  await fireEvent.changeText(screen.getByPlaceholderText('At least 6 characters'), password);
  await fireEvent.changeText(screen.getByPlaceholderText('Re-enter your new password'), confirm);
}

beforeEach(() => {
  mockParams = { email: 'ramzi@example.com' };
  mockVerify.mockReset().mockResolvedValue({ error: null });
  mockUpdatePassword.mockReset().mockResolvedValue({ error: null });
  mockSendPasswordReset.mockReset().mockResolvedValue({ error: null });
  mockReplace.mockReset();
});

it('says where the code was sent, with the email already filled in', async () => {
  await renderScreen();

  expect(screen.getByText(/6-digit code to ramzi@example\.com/)).toBeOnTheScreen();
  expect(screen.getByDisplayValue('ramzi@example.com')).toBeOnTheScreen();
});

it('right code + matching passwords: verifies the code, saves the new password, confirms', async () => {
  await renderScreen();

  await fill();
  await fireEvent.press(screen.getByText('Set new password'));

  expect(mockVerify).toHaveBeenCalledWith('ramzi@example.com', '123456');
  expect(mockUpdatePassword).toHaveBeenCalledWith('newpass1');
  expect(await screen.findByText('Password updated')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Continue'));
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('a wrong or expired code shows the error and never changes the password', async () => {
  mockVerify.mockResolvedValue({ error: 'Token has expired or is invalid' });
  await renderScreen();

  await fill();
  await fireEvent.press(screen.getByText('Set new password'));

  expect(await screen.findByText(/Token has expired or is invalid/)).toBeOnTheScreen();
  expect(mockUpdatePassword).not.toHaveBeenCalled();
  expect(screen.queryByText('Password updated')).toBeNull();
});

it('if saving the password fails after the code was accepted, retrying doesn’t re-use the (single-use) code', async () => {
  mockUpdatePassword.mockResolvedValueOnce({ error: 'Password should be different from the old password' }).mockResolvedValueOnce({ error: null });
  await renderScreen();

  await fill();
  await fireEvent.press(screen.getByText('Set new password'));
  expect(await screen.findByText(/different from the old password/)).toBeOnTheScreen();

  await fill({ code: '123456', password: 'another2' });
  await fireEvent.press(screen.getByText('Set new password'));

  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockUpdatePassword).toHaveBeenLastCalledWith('another2');
  expect(await screen.findByText('Password updated')).toBeOnTheScreen();
});

it.each([
  [{ code: '12345' }, /Enter the 6-digit code/],
  [{ code: '12ab56' }, /Enter the 6-digit code/],
  [{ password: 'abc' }, /at least 6 characters/],
  [{ password: 'newpass1', confirm: 'newpass2' }, /don.t match/],
])('checks the form before sending anything (%o)', async (input, message) => {
  await renderScreen();

  await fill(input as { code?: string; password?: string; confirm?: string });
  await fireEvent.press(screen.getByText('Set new password'));

  expect(await screen.findByText(message)).toBeOnTheScreen();
  expect(mockVerify).not.toHaveBeenCalled();
});

it('no email passed in (opened directly): asks for it', async () => {
  mockParams = {};
  await renderScreen();

  await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'me@example.com');
  await fill();
  await fireEvent.press(screen.getByText('Set new password'));

  expect(mockVerify).toHaveBeenCalledWith('me@example.com', '123456');
});

it('"Send a new code" emails a fresh code and says so', async () => {
  await renderScreen();

  await fireEvent.press(screen.getByText('Send a new code'));

  expect(mockSendPasswordReset).toHaveBeenCalledWith('ramzi@example.com');
  expect(await screen.findByText(/new code is on its way/)).toBeOnTheScreen();
});

it('a failed resend shows the error', async () => {
  mockSendPasswordReset.mockResolvedValue({ error: 'Email rate limit exceeded' });
  await renderScreen();

  await fireEvent.press(screen.getByText('Send a new code'));

  expect(await screen.findByText(/Email rate limit exceeded/)).toBeOnTheScreen();
});
