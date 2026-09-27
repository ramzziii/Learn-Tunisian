import { Stack } from 'expo-router';
import { setAudioModeAsync } from 'expo-audio';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveProfileProvider } from '@/lib/account/ActiveProfileContext';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { OnboardingProvider } from '@/lib/onboarding/OnboardingContext';

export default function RootLayout() {
  useEffect(() => {
    // Without this, iOS silently mutes all playback whenever the hardware
    // mute switch is on — no error, audio just never plays. A lesson word's
    // audio needs to play regardless of that switch.
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ActiveProfileProvider>
          <OnboardingProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'fade',
                animationDuration: 220,
              }}
            />
          </OnboardingProvider>
        </ActiveProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
