import { parseRecoveryUrl } from '@/lib/auth/parseRecoveryUrl';

// The client uses the PKCE flow (src/lib/supabase/client.ts), so a genuine
// reset link carries only a single-use `?code=`, which can be exchanged only
// on the device that requested the reset (it holds the code verifier). Bare
// session tokens in a link are never trusted: any app or web page could craft
// one to sign the learner into a different account (run-1 security audit).
describe('parseRecoveryUrl', () => {
  it('parses a PKCE-flow code from the query string', () => {
    const url = 'learntunisian://auth/reset-password?code=xyz789';
    expect(parseRecoveryUrl(url)).toEqual({ code: 'xyz789' });
  });

  it('never accepts session tokens from the URL fragment', () => {
    const url = 'learntunisian://auth/reset-password#access_token=abc123&refresh_token=def456&type=recovery&expires_in=3600';
    expect(parseRecoveryUrl(url)).toBeNull();
  });

  it('uses the query code and ignores fragment tokens when both are present', () => {
    const url = 'learntunisian://auth/reset-password?code=xyz789#access_token=abc123&refresh_token=def456';
    expect(parseRecoveryUrl(url)).toEqual({ code: 'xyz789' });
  });

  it('does not let a trailing fragment leak into the parsed query code', () => {
    const url = 'learntunisian://auth/reset-password?code=xyz789#type=recovery';
    expect(parseRecoveryUrl(url)).toEqual({ code: 'xyz789' });
  });

  it('works for the Expo Go form of the link too', () => {
    expect(parseRecoveryUrl('exp://192.168.1.5:8081/--/auth/reset-password?code=xyz789')).toEqual({ code: 'xyz789' });
  });

  it('returns null when the URL carries no recovery code', () => {
    expect(parseRecoveryUrl('learntunisian://auth/reset-password')).toBeNull();
    expect(parseRecoveryUrl('learntunisian://home')).toBeNull();
  });
});
