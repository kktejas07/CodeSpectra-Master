import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/route-auth'

// The assessment detail base URL has no page of its own — the admin review UI
// lives at /results (and editing at /edit). Redirect so a direct hit on
// /dashboard/admin/assessments/[id] lands on the results page instead of 404.
export default async function AssessmentRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const auth = await requireAdmin()
  if ('error' in auth) redirect('/auth/login')
  const { id } = await params
  redirect(`/dashboard/admin/assessments/${id}/results`)
}
