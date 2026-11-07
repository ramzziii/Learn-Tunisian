// "Are you sure?" works in a web browser too: react-native-web's Alert.alert
// does nothing, so the web uses the browser's confirm box.
import { Alert, Platform } from 'react-native';

import { confirmAction } from '@/lib/confirmAction';

const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
const originalOS = Platform.OS;
afterEach(() => {
  setOS(originalOS);
  jest.restoreAllMocks();
});

it('web: confirmed in the browser → runs the action', () => {
  setOS('web');
  const confirm = jest.fn(() => true);
  Object.defineProperty(globalThis, 'confirm', { value: confirm, configurable: true });
  const onConfirm = jest.fn();
  confirmAction({ title: 'Sign out?', message: 'Sure?', confirmLabel: 'Sign out', onConfirm });
  expect(confirm).toHaveBeenCalledWith('Sign out?\n\nSure?');
  expect(onConfirm).toHaveBeenCalled();
});

it('web: cancelled → nothing happens', () => {
  setOS('web');
  Object.defineProperty(globalThis, 'confirm', { value: jest.fn(() => false), configurable: true });
  const onConfirm = jest.fn();
  confirmAction({ title: 'Sign out?', message: 'Sure?', confirmLabel: 'Sign out', onConfirm });
  expect(onConfirm).not.toHaveBeenCalled();
});

it('phone: the usual Alert with Cancel and the confirm button', () => {
  setOS('ios');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const onConfirm = jest.fn();
  confirmAction({ title: 'Sign out?', message: 'Sure?', confirmLabel: 'Sign out', destructive: true, onConfirm });
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Sign out']);
  buttons[1].onPress!();
  expect(onConfirm).toHaveBeenCalled();
});
