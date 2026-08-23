import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';

// Sits at "/" purely to route the user to the right place based on
// auth/profile/onboarding state — it never renders real content itself.
export default function Index() {
  const { session, isLoading: authLoading } = useAuth();
  const { profiles, activeProfile, isLoading: profilesLoading } = useActiveProfile();

  if (authLoading) return <LoadingScreen />;
  if (!session) return <Redirect href="/auth/sign-in" />;
  if (profilesLoading) return <LoadingScreen />;
  if (profiles.length === 0) return <Redirect href="/onboarding/who" />;
  if (!activeProfile) return <Redirect href="/profiles" />;
  return <Redirect href="/home" />;
}
