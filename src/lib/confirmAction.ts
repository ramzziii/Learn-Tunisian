import { Alert, Platform } from 'react-native';

/**
 * "Are you sure?" before an action. React Native's Alert.alert does nothing
 * in a web browser (react-native-web has no alert dialog), so on the web this
 * uses the browser's own confirm box; on phones it's the usual Alert with a
 * Cancel and a confirm button.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) void onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => void onConfirm() },
  ]);
}

/** A message with just "OK" — Alert.alert on phones, the browser's alert on the web. */
export function showNotice(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
