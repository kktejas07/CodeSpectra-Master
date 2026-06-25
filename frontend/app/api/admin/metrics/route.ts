import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { users } from '@/lib/db/admin'
import { codeScans } from '@/lib/db/scans'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const userCol = await users()
    const list = await userCol.find({}).toArray()
    const totalUsers = list.length
    const superadmins = list.filter((r) => r.role === 'superadmin').length
    const tenantAdmins = list.filter(
      (r) => r.role === 'tenant_admin' || r.role === 'admin',
    ).length
    const endUsers = list.filter((r) => r.role === 'user' || !r.role).length

    const since = new Date(Date.now() - 15 * 60 * 1000)
    const activeNow = list.filter((r) => {
      const ts = r.updatedAt instanceof Date ? r.updatedAt : new Date(String(r.updatedAt))
      return ts && ts >= since
    }).length

    const scanCol = await codeScans()
    const submissionsCount = await scanCol.estimatedDocumentCount()

    /** Signups by calendar month (UTC), last 6 months. */
    const signupsByMonth: { date: string; users: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      const label = d.toLocaleString('en-US', { month: 'short' })
      const n = list.filter((r) => {
        const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(String(r.createdAt)).getTime()
        return t >= d.getTime() && t < next.getTime()
      }).length
      signupsByMonth.push({ date: label, users: n })
    }

    const submissionsByDay: { date: string; challenges: number; interviews: number; scans: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - i)
      day.setUTCHours(0, 0, 0, 0)
      const next = new Date(day)
      next.setUTCDate(next.getUTCDate() + 1)
      const c = await scanCol.countDocuments({
        created_at: { $gte: day.toISOString(), $lt: next.toISOString() },
      })
      submissionsByDay.push({
        date: day.toLocaleDateString('en-US', { weekday: 'short' }),
        challenges: 0,
        interviews: 0,
        scans: c,
      })
    }

    return NextResponse.json({
      totalUsers,
      activeNow,
      superadmins,
      tenantAdmins,
      endUsers,
      challengesCount: 0,
      submissionsCount,
      leaderboardRows: 0,
      usersByRole: [
        { name: 'Users', value: Math.max(0, endUsers) },
        { name: 'Org admins', value: tenantAdmins },
        { name: 'Platform admins', value: superadmins },
      ],
      userGrowth: signupsByMonth,
      activityTrend: submissionsByDay,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Metrics failed'
    console.error('[CodeSpectra] admin/metrics:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
