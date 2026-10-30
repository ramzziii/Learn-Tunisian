import { Redirect, Stack, useSegments } from 'expo-router';

import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';

// OnboardingProvider now lives at the root layout (app/_layout.tsx) — the
// pre-auth age-gate step needs its state to survive navigating outside
// this route group into /auth/sign-up, which would unmount a provider
// scoped here.
export default function OnboardingLayout() {
  const { session } = useAuth();
  const { profiles, isLoading } = useActiveProfile();
  const segments = useSegments() as string[];

  // One profile per account: an account that already has one never sets up
  // another. Plans isn't a setup step (settings opens it), so it stays open.
  const isPlans = segments[segments.length - 1] === 'plans';
  if (session && !isLoading && profiles.length > 0 && !isPlans) return <Redirect href="/" />;

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
