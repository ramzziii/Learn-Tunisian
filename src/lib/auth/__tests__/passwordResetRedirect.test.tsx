// The reset email's link must come back to wherever the app is running:
// Expo Go only answers exp://… links, a real build answers learntunisian://…
// A hard-coded learntunisian:// link can't open the app in Expo Go.
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockResetPasswordForEmail = jest.fn(async () => ({ error: null }));
const mockVerifyOtp = jest.fn(async () => ({ data: {}, error: null as null | { message: string } }));
const mockExchangeCode = jest.fn(async () => ({ data: {}, error: null as null | { message: string } }));
const mockSetSession = jest.fn(async () => ({ data: {}, error: null }));
const mockCreateURL = jest.fn((path: string) => `exp://192.168.1.5:8081/--${path}`);

jest.mock('expo-linking', () => ({ createURL: (path: string) => mockCreateURL(path) }));
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      resetPasswordForEmail: (...a: unknown[]) => mockResetPasswordForEmail(...(a as [])),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...(a as [])),
      exchangeCodeForSession: (...a: unknown[]) => mockExchangeCode(...(a as [])),
      setSession: (...a: unknown[]) => mockSetSession(...(a as [])),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthProvider, useAuth } = require('@/lib/auth/AuthContext');

let auth: {
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  verifyPasswordResetCode: (email: string, code: string) => Promise<{ error: string | null }>;
  establishRecoverySession: (params: unknown) => Promise<{ error: string | null }>;
};
function Capture() {
  auth = useAuth();
  return <Text>ready</Text>;
}

beforeEach(() => {
  mockResetPasswordForEmail.mockClear();
  mockCreateURL.mockClear();
});

it('sends the reset link back to this running app’s own reset screen (Expo Go or build)', async () => {
  await render(
    <AuthProvider>
      <Capture />
    </AuthProvider>
  );

  await act(async () => {
    await auth.sendPasswordReset('ramzi@example.com');
  });

  expect(mockCreateURL).toHaveBeenCalledWith('/auth/reset-password');
  expect(mockResetPasswordForEmail).toHaveBeenCalledWith('ramzi@example.com', {
    redirectTo: 'exp://192.168.1.5:8081/--/auth/reset-password',
  });
});

describe('verifyPasswordResetCode (6-digit code from the reset email)', () => {
  async function renderAuth() {
    await render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );
  }

  it('checks the code with Supabase as a recovery code (trimmed), which signs the user in to set a password', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: {}, error: null });
    await renderAuth();

    let result: { error: string | null } = { error: 'not run' };
    await act(async () => {
      result = await auth.verifyPasswordResetCode(' ramzi@example.com ', ' 123456 ');
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'ramzi@example.com', token: '123456', type: 'recovery' });
    expect(result).toEqual({ error: null });
  });

  it('a wrong or expired code returns Supabase’s message', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: {}, error: { message: 'Token has expired or is invalid' } });
    await renderAuth();

    let result: { error: string | null } = { error: null };
    await act(async () => {
      result = await auth.verifyPasswordResetCode('ramzi@example.com', '000000');
    });

    expect(result).toEqual({ error: 'Token has expired or is invalid' });
  });
});

describe('establishRecoverySession (reset link)', () => {
  async function renderAuth() {
    await render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );
  }

  it('exchanges the PKCE code — which only works on the device that asked for the reset', async () => {
    mockExchangeCode.mockClear();
    await renderAuth();

    let result: { error: string | null } = { error: 'not run' };
    await act(async () => {
      result = await auth.establishRecoverySession({ code: 'xyz789' });
    });

    expect(mockExchangeCode).toHaveBeenCalledWith('xyz789');
    expect(result).toEqual({ error: null });
  });

  it('never installs bare session tokens handed to it', async () => {
    mockSetSession.mockClear();
    await renderAuth();

    let result: { error: string | null } = { error: null };
    await act(async () => {
      result = await auth.establishRecoverySession({ accessToken: 'a', refreshToken: 'r' });
    });

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.error).toMatch(/not valid/i);
  });
});
