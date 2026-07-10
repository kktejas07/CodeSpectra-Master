import { redirect } from 'next/navigation'

export default function MobileRedirect() {
  redirect('/dashboard/admin/settings?section=mobile')
}
