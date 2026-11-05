import { createContext, useContext, type ReactNode } from 'react';

import { BackButton } from '@/components/ui/BackButton';

interface AdminTabValue {
  inTab: boolean;
  /** What a tab shows at the top of an embedded screen (e.g. the Audio tab's switcher). */
  header: ReactNode;
}

const AdminTabContext = createContext<AdminTabValue>({ inTab: false, header: null });

/**
 * Wraps an admin screen shown inside one of the Admin tabs (Today, Requests,
 * Review, Audio, Content). The same screen opened on its own (its old
 * /admin/... address) still gets a back button.
 */
export function AdminTabProvider({ header = null, children }: { header?: ReactNode; children: ReactNode }) {
  return <AdminTabContext.Provider value={{ inTab: true, header }}>{children}</AdminTabContext.Provider>;
}

export const useAdminTab = () => useContext(AdminTabContext);

/** Top of an admin screen: a back button on its own, or the tab's header inside the Admin tabs. */
export function AdminScreenTop() {
  const { inTab, header } = useAdminTab();
  return inTab ? <>{header}</> : <BackButton themed />;
}
