// The banner shown while an admin previews the free plan: only then, and it
// leads to Profile, where the switch is.
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

let mockPremium: { isAdmin: boolean; adminPreview: 'premium' | 'free' } | null = null;
jest.mock('@/lib/premium/adminPreviewState', () => ({ useAdminPreviewState: () => mockPremium }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FreePreviewBanner } = require('@/components/access/FreePreviewBanner');

const TEXT = '👀 Viewing as a free user · Switch in Profile';

beforeEach(() => mockPush.mockReset());

it('shows while an admin views the app as a free user, and opens Profile', async () => {
  mockPremium = { isAdmin: true, adminPreview: 'free' };
  await render(<FreePreviewBanner />);
  fireEvent.press(screen.getByText(TEXT));
  expect(mockPush).toHaveBeenCalledWith('/profile');
});

it.each([
  ['an admin viewing as Premium', { isAdmin: true, adminPreview: 'premium' as const }],
  ['a learner (even with a stored "free" choice)', { isAdmin: false, adminPreview: 'free' as const }],
  ['outside the providers', null],
])('hidden for %s', async (_label, premium) => {
  mockPremium = premium;
  await render(<FreePreviewBanner />);
  expect(screen.queryByText(TEXT)).toBeNull();
});
