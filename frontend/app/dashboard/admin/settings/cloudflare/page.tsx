import { redirect } from 'next/navigation'

export default function CloudflareRedirect() {
  redirect('/dashboard/admin/settings?section=cloudflare')
}
