import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, nowIso } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; teamId: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'event not found' }, { status: 404 })
  if (hk.status === 'closed' || hk.results_released) return NextResponse.json({ error: 'event closed' }, { status: 409 })
  if ((hk.judges || []).includes(user.id)) return NextResponse.json({ error: 'Judges of this event cannot join a team' }, { status: 409 })
  if (hk.status === 'draft') return NextResponse.json({ error: 'This event isn’t open for registration yet.' }, { status: 409 })

  // Only the secret invite token (the team's share link / QR) grants a join.
  // Team id and slug are visible to every signed-in user via GET /teams, so
  // accepting them here let anyone join any team. There is no open-join flag
  // on HackathonDoc; email invites go through /api/hackathons/invites.
  const teamsCol = await hackathonTeams()
  const team = teamId ? await teamsCol.findOne({ hackathon_id: hk.id, qr_token: teamId }) : null
  if (!team) return NextResponse.json({ error: 'This invite link isn’t valid. Ask your team captain for a new one.' }, { status: 404 })

  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: `Team is full (${hk.max_per_team} max)` }, { status: 409 })
  }

  const already = await teamsCol.findOne({
    hackathon_id: hk.id,
    'members.user_id': user.id,
  })
  if (already) {
    if (already.id === team.id) {
      return NextResponse.json({ error: `Already a member of this team`, team: already.slug, team_name: already.name, already_this_team: true }, { status: 409 })
    }
    if (already.members.length === 1 && (already.submissions || 0) === 0) {
      await teamsCol.deleteOne({ id: already.id })
    } else {
      return NextResponse.json({ error: `already on a team in this event`, team: already.slug, team_name: already.name, already_this_team: false }, { status: 409 })
    }
  }

  // Atomic capacity check: only push while slot `max_per_team - 1` is empty,
  // so two concurrent joins can't overfill the team.
  const maxPerTeam = Math.max(1, Number(hk.max_per_team) || 1)
  const pushed = await teamsCol.updateOne(
    { id: team.id, [`members.${maxPerTeam - 1}`]: { $exists: false }, 'members.user_id': { $ne: user.id } },
    {
      $push: { members: { user_id: user.id, name: user.name || (user.email || '').split('@')[0] || 'Member', role: 'member' } as Record<string, unknown> },
      $set: { updated_at: nowIso() },
    },
  )

  if (pushed.modifiedCount === 0) {
    return NextResponse.json({ error: `Team is full (${maxPerTeam} max)` }, { status: 409 })
  }
  void import('@/lib/automation/events').then(({ emit }) => emit('hackathon.registered', {
    event_id: hk.id, event_kind: 'hackathon', event_name: hk.name, user_id: user.id, team_name: team.name, starts_at: hk.starts_at ?? null,
  }, { tenantId: hk.tenant_id ?? null, idempotencyKey: `hackathon.registered:${hk.id}:${user.id}` })).catch((e) => console.error('[automation] emit failed:', e))

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name, slug: team.slug } })
}
