import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonSubmissions, hackathons, hackathonTeams } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // tenant_admin can only judge submissions for their own tenant's hackathon
  if (user.role === 'tenant_admin' && (!user.tenantId || hk.tenant_id !== user.tenantId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)
  if (!isAdmin && !isJudge) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subsCol = await hackathonSubmissions()
  const subs = await subsCol
    .find({ hackathon_id: hk.id })
    .sort({ submitted_at: -1 })
    .toArray()

  const teamsCol = await hackathonTeams()
  const teamIds = [...new Set(subs.map((s) => s.team_id).filter(Boolean))]
  const teams = await teamsCol.find({ id: { $in: teamIds } }).toArray()
  const teamMap = new Map(teams.map((t) => [t.id, t.name]))

  const data = subs.map((s) => ({
    ...s,
    team_name: teamMap.get(s.team_id) || 'Unknown',
  }))

  return NextResponse.json({ data })
}
