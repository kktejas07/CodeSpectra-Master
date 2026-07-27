import { redirect } from 'next/navigation'
import { DASHBOARD_ROUTES } from '@/lib/rbac'
import { requireSuperAdmin } from '@/lib/route-auth'

/** `/dashboard/admin` is not a hub; bookmarks still resolve to the operations console. */
export default async function AdminIndexRedirect() {
  const auth = await requireSuperAdmin()
  if ('error' in auth) redirect('/auth/login')
  redirect(DASHBOARD_ROUTES.platform.system)
}


