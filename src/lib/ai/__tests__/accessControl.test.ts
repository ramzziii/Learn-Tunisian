import { canAccessTalkFeature } from '@/lib/ai/accessControl';

describe('canAccessTalkFeature', () => {
  it('allows the adult/teen track', () => {
    expect(canAccessTalkFeature('adult')).toBe(true);
  });

  it('does not allow the kid track', () => {
    expect(canAccessTalkFeature('kid')).toBe(false);
  });
});
