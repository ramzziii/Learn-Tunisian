import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveProfileProvider } from '@/lib/account/ActiveProfileContext';
import { AuthProvider } from '@/lib/auth/AuthContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ActiveProfileProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ActiveProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
