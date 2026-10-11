import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useIsAdmin } from '@/lib/admin/AdminContext';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * The gate for every /admin/* screen — including app/admin/corrections.tsx,
 * which previously had no auth/role check at all (see its own comment).
 * Redirects anyone who isn't a signed-in admin back to the app's root.
 */
export default function AdminLayout() {
  const { session, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  if (authLoading || adminLoading) return <LoadingScreen />;
  if (!session || !isAdmin) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 280 }} />;
}
