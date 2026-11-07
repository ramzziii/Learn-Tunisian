// Guest mode is read from the device before any screen renders, so no screen
// can load data as "not a guest" (signed-in tables) and show nothing.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

let mockResolve: (v: string | null) => void = () => undefined;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => new Promise<string | null>((resolve) => (mockResolve = resolve))),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ session: null }) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GuestProvider, useGuest } = require('@/lib/guest/GuestContext');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isGuestSessionActive } = require('@/lib/guest/guestSession');

function Screen() {
  const { isGuest } = useGuest();
  return <Text>{`screen: guest=${isGuest} data-layer=${isGuestSessionActive()}`}</Text>;
}

it('renders no screen until guest mode is known; then screens and the data layer agree', async () => {
  await render(
    <GuestProvider>
      <Screen />
    </GuestProvider>
  );
  expect(screen.queryByText(/screen:/)).toBeNull();
  mockResolve('1');
  expect(await screen.findByText('screen: guest=true data-layer=true')).toBeOnTheScreen();
});
