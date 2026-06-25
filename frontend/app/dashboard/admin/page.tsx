import { redirect } from 'next/navigation'
import { DASHBOARD_ROUTES } from '@/lib/rbac'

/** `/dashboard/admin` is not a hub; bookmarks still resolve to the operations console. */
export default function AdminIndexRedirect() {
  redirect(DASHBOARD_ROUTES.platform.system)
}
