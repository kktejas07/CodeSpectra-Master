import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonInvites, nowIso } from '@/lib/db/qr-events'
import { hackathonEmailTemplates } from '@/lib/email-templates'
import { sendEmail } from '@/lib/send-email'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET is public (invite metadata only) so a signed-out invitee sees the
 * invite and a sign-in button instead of an error. Accepting needs sign-in.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimitSlidingWindow(`hk-invite-get:${clientLimiterKeyFromRequest(req, null)}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token || token.length > 64) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const invitesCol = await hackathonInvites()
  const invite = await invitesCol.findOne({ token })
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })
  if (new Date(invite.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })

  const hk = await (await hackathons()).findOne({ id: invite.hackathon_id })
  if (!hk || hk.status === 'draft') return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const team = await (await hackathonTeams()).findOne({ id: invite.team_id })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  return NextResponse.json({
    token,
    eventName: hk.name,
    eventSlug: hk.slug,
    eventStatus: hk.status,
    teamName: team.name,
    teamId: team.id,
    invitedBy: invite.invited_by_name,
    expiresAt: invite.expires_at,
    // Masked so the page can say which address the invite is for without leaking it.
    invitedEmail: invite.email ? invite.email.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
  })
}

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token : null
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const invitesCol = await hackathonInvites()
  const invite = await invitesCol.findOne({ token })
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite has expired' }, { status: 410 })

  // An email invite is for that address only (the open share link is the token-only path).
  if (invite.email && (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase())) {
    return NextResponse.json({ error: 'This invite was sent to a different email address. Sign in with that account to accept it.' }, { status: 403 })
  }

  const hk = await (await hackathons()).findOne({ id: invite.hackathon_id })
  if (!hk || hk.status === 'draft') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (hk.status === 'closed' || hk.results_released) return NextResponse.json({ error: 'Event is closed' }, { status: 409 })
  if ((hk.judges || []).includes(user.id)) return NextResponse.json({ error: 'Judges of this event cannot join a team' }, { status: 409 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({ id: invite.team_id, hackathon_id: hk.id })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: 'Team is full' }, { status: 409 })
  }

  const already = await teamsCol.findOne({
    hackathon_id: hk.id,
    'members.user_id': user.id,
  })
  if (already) {
    if (already.id === team.id) {
      return NextResponse.json({ error: 'You are already on this team' }, { status: 409 })
    }
    if (already.members.length === 1 && (already.submissions || 0) === 0) {
      await teamsCol.deleteOne({ id: already.id })
    } else {
      return NextResponse.json({ error: 'You are already on a team for this event' }, { status: 409 })
    }
  }

  // Claim the invite first (single use), then push under an atomic size cap.
  const claimed = await invitesCol.updateOne(
    { id: invite.id, accepted_at: { $exists: false } },
    { $set: { accepted_at: nowIso(), accepted_by_user_id: user.id } },
  )
  if (claimed.modifiedCount === 0) return NextResponse.json({ error: 'Invite already used' }, { status: 409 })
  const pushed = await teamsCol.updateOne(
    { id: team.id, [`members.${Math.max(0, hk.max_per_team - 1)}`]: { $exists: false }, 'members.user_id': { $ne: user.id } } as Record<string, unknown>,
    {
      $push: { members: { user_id: user.id, name: user.name || (user.email || '').split('@')[0] || 'Member', role: 'member' } as never },
      $set: { updated_at: nowIso() },
    },
  )
  if (pushed.modifiedCount === 0) {
    await invitesCol.updateOne({ id: invite.id }, { $unset: { accepted_at: '', accepted_by_user_id: '' } })
    return NextResponse.json({ error: 'Team is full' }, { status: 409 })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    const template = hackathonEmailTemplates.teamJoinConfirmation({
      eventName: hk.name,
      teamName: team.name,
      memberName: user.name || 'Team Member',
      workspaceUrl: `${base}/hackathons/${hk.slug}/workspace`,
    })
    await sendEmail(user.email || '', template)
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, team: { id: team.id, name: team.name, slug: team.slug } })
}