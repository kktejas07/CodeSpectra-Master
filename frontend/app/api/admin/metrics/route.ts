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
    const [
      totalUsers,
      superadmins,
      tenantAdmins,
      endUsers,
    ] = await Promise.all([
      userCol.countDocuments(),
      userCol.countDocuments({ role: 'superadmin' }),
      userCol.countDocuments({ role: { $in: ['tenant_admin', 'admin'] } }),
      userCol.countDocuments({ role: { $in: ['user', null] } }),
    ])

    const since = new Date(Date.now() - 15 * 60 * 1000)
    const activeNow = await userCol.countDocuments({ updatedAt: { $gte: since } })

    const scanCol = await codeScans()
    const submissionsCount = await scanCol.estimatedDocumentCount()

    const signupsByMonth: { date: string; users: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      const label = d.toLocaleString('en-US', { month: 'short' })
      const n = await userCol.countDocuments({
        createdAt: { $gte: d, $lt: next },
      })
      signupsByMonth.push({ date: label, users: n })
    }

    const submissionsByDay = await Promise.all(
      Array.from({ length: 7 }, async (_, i) => {
        const day = new Date(now)
        day.setUTCDate(day.getUTCDate() - (6 - i))
        day.setUTCHours(0, 0, 0, 0)
        const next = new Date(day)
        next.setUTCDate(next.getUTCDate() + 1)
        const c = await scanCol.countDocuments({
          created_at: { $gte: day.toISOString(), $lt: next.toISOString() },
        })
        return {
          date: day.toLocaleDateString('en-US', { weekday: 'short' }),
          challenges: 0,
          interviews: 0,
          scans: c,
        }
      })
    )

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
        { name: 'Users', value: endUsers },
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
