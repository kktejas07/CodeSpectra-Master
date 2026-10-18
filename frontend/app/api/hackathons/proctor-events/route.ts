import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonProctorEvents, HackathonProctorEventDoc, newId, nowIso } from '@/lib/db/qr-events'
import { isHackathonStaff, isHackathonJudge } from '@/lib/hackathons/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const type = typeof body?.type === 'string' ? body.type : null
  const hackathonId = typeof body?.hackathon_id === 'string' ? body.hackathon_id : null
  const severity: HackathonProctorEventDoc['severity'] = ['low', 'medium', 'high', 'critical'].includes(body?.severity)
    ? body.severity
    : 'low'

  if (!type || !hackathonId) {
    return NextResponse.json({ error: 'type and hackathon_id are required' }, { status: 400 })
  }

  const validTypes = ['tab_blur', 'tab_focus', 'copy_attempt', 'paste_attempt', 'right_click', 'fullscreen_exit', 'idle_warning', 'suspicious_activity']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  }

  const hk = await (await hackathons()).findOne({ $or: [{ id: hackathonId }, { slug: hackathonId }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id })
  if (!team) return NextResponse.json({ error: 'Not in a team' }, { status: 403 })

  const col = await hackathonProctorEvents()
  const doc: HackathonProctorEventDoc = {
    id: newId(),
    hackathon_id: hk.id,
    team_id: team.id,
    user_id: user.id,
    type,
    problem_slug: typeof body?.problem_slug === 'string' ? body.problem_slug : undefined,
    severity,
    meta: typeof body?.meta === 'object' && body.meta !== null ? body.meta : undefined,
    created_at: nowIso(),
  }

  await col.insertOne(doc)
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const hackathonId = searchParams.get('hackathon_id')
  if (!hackathonId) return NextResponse.json({ error: 'hackathon_id required' }, { status: 400 })

  const hk = await (await hackathons()).findOne({ $or: [{ id: hackathonId }, { slug: hackathonId }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Judges of this event, superadmin, or this event's own company admin (deny by default).
  if (!isHackathonJudge(user, hk) && !isHackathonStaff(user, hk)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const col = await hackathonProctorEvents()
  const events = await col.find({ hackathon_id: hk.id }).sort({ created_at: -1 }).toArray()

  return NextResponse.json({ events })
}