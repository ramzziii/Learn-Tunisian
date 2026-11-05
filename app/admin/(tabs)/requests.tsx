import AdminTranslationRequestsQueue from '../translation-requests';
import { AdminTabProvider } from '@/components/admin/AdminScreenTop';

/** Admin → Requests: learners' translation questions, soonest deadline first. */
export default function AdminRequestsTab() {
  return (
    <AdminTabProvider>
      <AdminTranslationRequestsQueue />
    </AdminTabProvider>
  );
}
