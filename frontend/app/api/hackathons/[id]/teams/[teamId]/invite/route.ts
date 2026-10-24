import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonInvites, HackathonInviteDoc, nowIso, newId, newToken } from '@/lib/db/qr-events'
import { hackathonEmailTemplatesFor } from '@/lib/email-templates'
import { localeForEmail } from '@/lib/i18n/recipient'
import { outboundT } from '@/lib/i18n/outbound'
import { sendEmail } from '@/lib/send-email'
import { users } from '@/lib/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INVITE_EXPIRY_HOURS = 168 // 7 days

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; teamId: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const { id, teamId } = await ctx.params

  const hk = await (await hackathons()).findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (hk.status === 'draft') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (hk.status === 'closed' || hk.results_released) return NextResponse.json({ error: 'Event is closed' }, { status: 409 })

  const teamsCol = await hackathonTeams()
  const team = await teamsCol.findOne({
    hackathon_id: hk.id,
    $or: [{ id: teamId }, { slug: teamId }],
  })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const isCaptain = team.members.some(m => m.user_id === user.id && m.role === 'captain')
  if (!isCaptain) return NextResponse.json({ error: 'Only the team captain can send invites' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null
  if (!email) return NextResponse.json({ error: 'Email is required', code: 'auth_email_required' }, { status: 400 })

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })

  // Members are stored by user id, so compare against their account emails.
  const memberDocs = await (await users())
    .find({ $or: [{ id: { $in: team.members.map((m) => m.user_id) } }, { _id: { $in: team.members.map((m) => m.user_id) } }] } as Record<string, unknown>, { projection: { email: 1 } })
    .toArray()
  if (memberDocs.some((u) => (u.email || '').toLowerCase() === email)) {
    return NextResponse.json({ error: 'This user is already on the team' }, { status: 409 })
  }
  if (team.members.length >= hk.max_per_team) {
    return NextResponse.json({ error: `Team is full (${hk.max_per_team} max)`, code: 'hk_team_full_max', params: { max: Number(hk.max_per_team) } }, { status: 409 })
  }

  const invitesCol = await hackathonInvites()
  const existing = await invitesCol.findOne({
    hackathon_id: hk.id,
    team_id: team.id,
    email,
    accepted_at: { $exists: false },
  })

  let token: string
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    token = existing.token
  } else {
    token = newToken()
    const doc: HackathonInviteDoc = {
      id: newId(),
      hackathon_id: hk.id,
      team_id: team.id,
      email,
      token,
      invited_by_user_id: user.id,
      invited_by_name: user.name || user.email || 'Team Captain',
      expires_at: new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600000).toISOString(),
      created_at: nowIso(),
    }
    await invitesCol.insertOne(doc)
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteUrl = `${base}/hackathons/join?token=${token}`

  try {
    const locale = await localeForEmail(email)
    const template = hackathonEmailTemplatesFor(locale).teamInvite({
      eventName: hk.name,
      teamName: team.name,
      invitedByName: user.name || user.email || 'Team Captain',
      inviteUrl,
      expiresIn: outboundT('email', locale)('duration.sevenDays'),
    })
    await sendEmail(email, template)
  } catch (e) {
    console.error('[Hackathon Invite] Failed to send email:', e)
    return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: `Invite sent to ${email}` })
}