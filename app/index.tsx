import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useActiveProfile } from '@/lib/account/ActiveProfileContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { useGuest } from '@/lib/guest/GuestContext';

// Sits at "/" purely to route the user to the right place based on
// auth/profile/onboarding state — it never renders real content itself.
export default function Index() {
  const { session, isLoading: authLoading } = useAuth();
  const { isGuest, isLoading: guestLoading } = useGuest();
  const { profiles, activeProfile, isLoading: profilesLoading } = useActiveProfile();

  if (authLoading || guestLoading) return <LoadingScreen />;
  // Signed out: the guest preview (device only) continues at Home; otherwise Welcome.
  if (!session) return <Redirect href={isGuest ? '/home' : '/welcome'} />;
  if (profilesLoading) return <LoadingScreen />;
  if (profiles.length === 0) return <Redirect href="/onboarding/consent" />;
  if (!activeProfile) return <Redirect href="/profiles" />;
  return <Redirect href="/home" />;
}
