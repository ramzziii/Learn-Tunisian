import { createContext, useContext } from 'react';

import type { AdminPremiumPreview } from '@/lib/premium/access';

/**
 * The admin's "view app as" choice, for shared UI (ScreenContainer's
 * FreePreviewBanner). Provided by PremiumProvider; null outside it.
 */
export interface AdminPreviewState {
  isAdmin: boolean;
  adminPreview: AdminPremiumPreview;
}

export const AdminPreviewStateContext = createContext<AdminPreviewState | null>(null);

export const useAdminPreviewState = (): AdminPreviewState | null => useContext(AdminPreviewStateContext);
