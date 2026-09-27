import { Stack } from 'expo-router';

// OnboardingProvider now lives at the root layout (app/_layout.tsx) — the
// pre-auth goal-select step needs its state to survive navigating outside
// this route group into /auth/sign-up, which would unmount a provider
// scoped here.
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 220,
      }}
    />
  );
}
