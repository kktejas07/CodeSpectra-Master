/** GET /api/campus/me — the signed-in student's own campus records, drives, applications and offers. */
import { NextResponse } from 'next/server'
import { guarded, loadStaffContext, unauthorized, withUser } from '@/lib/campus/access'
import { studentView } from '@/lib/campus/drives'
import { listJoinableColleges } from '@/lib/campus/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return guarded('me GET', async () => {
    const user = await withUser()
    if (!user) return unauthorized()
    const [view, staff] = await Promise.all([studentView(user), user.role === 'superadmin' ? null : loadStaffContext(user)])
    const joinable = view.memberships.length ? [] : await listJoinableColleges()
    return NextResponse.json({
      ...view,
      joinable,
      staff: user.role === 'superadmin' ? { role: 'superadmin' } : staff ? { role: staff.role, college: staff.college.name } : null,
      can_onboard: user.role === 'tenant_admin' && !!user.tenantId && !staff,
    }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
