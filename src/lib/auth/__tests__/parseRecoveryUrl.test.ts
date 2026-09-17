import { parseRecoveryUrl } from '@/lib/auth/parseRecoveryUrl';

describe('parseRecoveryUrl', () => {
  it('parses implicit-flow tokens from the URL fragment', () => {
    const url = 'learntunisian://auth/reset-password#access_token=abc123&refresh_token=def456&type=recovery&expires_in=3600';
    expect(parseRecoveryUrl(url)).toEqual({ accessToken: 'abc123', refreshToken: 'def456' });
  });

  it('parses a PKCE-flow code from the query string', () => {
    const url = 'learntunisian://auth/reset-password?code=xyz789';
    expect(parseRecoveryUrl(url)).toEqual({ code: 'xyz789' });
  });

  it('prefers fragment tokens over a query code when both are somehow present', () => {
    const url = 'learntunisian://auth/reset-password?code=xyz789#access_token=abc123&refresh_token=def456';
    expect(parseRecoveryUrl(url)).toEqual({ accessToken: 'abc123', refreshToken: 'def456' });
  });

  it('does not let a trailing fragment leak into the parsed query code', () => {
    const url = 'learntunisian://auth/reset-password?code=xyz789#type=recovery';
    expect(parseRecoveryUrl(url)).toEqual({ code: 'xyz789' });
  });

  it('returns null when the URL carries no recovery credentials', () => {
    expect(parseRecoveryUrl('learntunisian://auth/reset-password')).toBeNull();
    expect(parseRecoveryUrl('learntunisian://home')).toBeNull();
  });
});
