// The Supabase client must use the PKCE auth flow. With the implicit flow a
// password-reset link carries a full session in its URL, which any app that
// registers the same custom scheme could capture (run-1 security audit).
// PKCE links carry a single-use code that only this device can exchange.
const mockCreateClient = jest.fn(() => ({ auth: {}, storage: { from: jest.fn() } }));

jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {} }));
jest.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => mockCreateClient(...(a as [])) }));

it('creates the client with flowType "pkce"', () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@/lib/supabase/client');
  });

  expect(mockCreateClient).toHaveBeenCalledWith(
    'https://example.supabase.co',
    'anon-key',
    expect.objectContaining({ auth: expect.objectContaining({ flowType: 'pkce', detectSessionInUrl: false }) })
  );
});
