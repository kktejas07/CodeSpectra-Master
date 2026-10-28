import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonSubmissions, hackathons, hackathonTeams } from '@/lib/db/qr-events'
import { isHackathonStaff, isHackathonJudge } from '@/lib/hackathons/access'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 })

  const isAdmin = isHackathonStaff(user, hk)
  const isJudge = isHackathonJudge(user, hk)
  if (!isAdmin && !isJudge) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
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

  // Blind mode hides who built it from judges (staff still see names);
  // device info (IP / user agent) is staff-only either way.
  const blind = sanitizeJudgingConfig(hk.judging_config).blindMode && !isAdmin
  const alias = new Map<string, string>()
  teamIds.forEach((tid, i) => alias.set(tid, `Team ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`))
  const data = subs.map((s) => {
    const { _id, device_info, ...rest } = s as any
    void _id
    return {
      ...rest,
      ...(isAdmin ? { device_info } : {}),
      team_name: blind ? alias.get(s.team_id) || 'Team' : teamMap.get(s.team_id) || 'Unknown',
    }
  })

  return NextResponse.json({ data })
}
