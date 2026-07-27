import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/route-auth'

export default async function CloudflareRedirect() {
  const auth = await requireSuperAdmin()
  if ('error' in auth) redirect('/auth/login')
  redirect('/dashboard/admin/settings?section=cloudflare')
}
