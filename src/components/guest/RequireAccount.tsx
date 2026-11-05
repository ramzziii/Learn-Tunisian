import type { ReactNode } from 'react';

import { CreateAccountPrompt } from '@/components/guest/CreateAccountPrompt';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAccess } from '@/lib/access/AccessContext';

/**
 * Route guard for account-only screens: a guest (signed out, device only)
 * gets the create-account explanation instead, and the screen itself never
 * renders — so it loads nothing, even when opened by a direct link.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { tier, isResolved } = useAccess();
  if (!isResolved) return <LoadingScreen themed />;
  if (tier === 'guest') return <CreateAccountPrompt reason="account" />;
  return <>{children}</>;
}
