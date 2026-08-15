import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, nowIso } from '@/lib/db/qr-events'
import { hackathonEmailTemplates } from '@/lib/email-templates'
import { notifyMany } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['superadmin', 'admin', 'tenant_admin'].includes((user.role || '').toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // tenant_admin can only release results for their own tenant's hackathon
  if (user.role === 'tenant_admin' && user.tenantId && hk.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Release results — from submitted/under_review/review_completed to released
  // WARNING: unreviewed submissions are auto-scored as 0
  const subsCol = await hackathonSubmissions()
  const now = nowIso()
  const unreviewedCount = await subsCol.countDocuments({ hackathon_id: hk.id, status: { $in: ['submitted', 'under_review'] } })
  if (unreviewedCount > 0) {
    await subsCol.updateMany(
      { hackathon_id: hk.id, status: { $in: ['submitted', 'under_review'] } },
      { $set: { status: 'released', score: 0, reviewed_at: now } },
    )
  }
  const updateResult = await subsCol.updateMany(
    { hackathon_id: hk.id, status: 'review_completed' },
    { $set: { status: 'released', reviewed_at: now } },
  )

  // Mark hackathon as released
  const releasedAt = nowIso()
  await col.updateOne({ id: hk.id }, { $set: { results_released: true, released_at: releasedAt } })

  // Get all teams and send email notifications
  const teamsCol = await hackathonTeams()
  const affectedTeams = await teamsCol.find({ hackathon_id: hk.id }).sort({ xp: -1 }).toArray()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let emailsSent = 0

  for (let i = 0; i < affectedTeams.length; i++) {
    const team = affectedTeams[i]
    const rank = i + 1
    const resultsUrl = `/hackathons/${hk.slug}/results`

    const memberIds = team.members.map((m) => m.user_id).filter(Boolean)
    const notified = await notifyMany(memberIds, {
      type: 'hackathon.results',
      title: `Results released: ${hk.name}`,
      message: `Your team "${team.name}" ranked #${rank} of ${affectedTeams.length} with ${team.xp} XP.`,
      link: resultsUrl,
      icon: 'trophy',
      send_email: true,
    })
    emailsSent += notified
  }

  return NextResponse.json({
    ok: true,
    released_at: releasedAt,
    submissions_updated: updateResult.modifiedCount,
    pending_auto_scored: unreviewedCount,
    teams_affected: affectedTeams.length,
    emails_sent: emailsSent,
  })
}
