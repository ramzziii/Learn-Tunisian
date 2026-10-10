import { Stack } from 'expo-router';
import { setAudioModeAsync } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveProfileProvider } from '@/lib/account/ActiveProfileContext';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { OnboardingProvider } from '@/lib/onboarding/OnboardingContext';
import { ThemeProvider, useTheme } from '@/lib/theme/ThemeContext';

export default function RootLayout() {
  useEffect(() => {
    // Without this, iOS silently mutes all playback whenever the hardware
    // mute switch is on — no error, audio just never plays. A lesson word's
    // audio needs to play regardless of that switch.
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ActiveProfileProvider>
            <OnboardingProvider>
              <RootNavigator />
            </OnboardingProvider>
          </ActiveProfileProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Separate from RootLayout so it can call useTheme() — that hook only
 * works inside the ThemeProvider that RootLayout itself renders. */
function RootNavigator() {
  const { isDark } = useTheme();

  return (
    <>
      {/* Keeps the OS status bar icons legible against whichever theme is
          active — light icons on dark backgrounds, dark icons on light. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          // A native-feeling push with swipe-back-to-dismiss (comes free
          // with this animation type on iOS), rather than the previous
          // plain fade — reads as more premium for a mobile app.
          animation: 'slide_from_right',
          animationDuration: 280,
        }}
      />
    </>
  );
}
