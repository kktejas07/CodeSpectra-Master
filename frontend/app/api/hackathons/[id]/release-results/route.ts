import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, nowIso } from '@/lib/db/qr-events'
import { hackathonEmailTemplates } from '@/lib/email-templates'
import { notifyMany } from '@/lib/notifications'
import { buildProjectReport } from '@/lib/hackathons/reporting'
import { collectHumanScores, average } from '@/lib/hackathons/calibration'
import { getMongoDb } from '@/lib/mongodb'

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
  if (user.role === 'tenant_admin' && (!user.tenantId || hk.tenant_id !== user.tenantId)) {
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
  void appUrl
  let emailsSent = 0

  // Per-project report summaries — deterministic, built from stored judging
  // state only (no new AI calls). Absent screening/evidence is marked via
  // has_screening/has_evidence and rendered as "unavailable" — never fabricated.
  const allSubs = await subsCol.find({ hackathon_id: hk.id }).toArray()
  const flatHuman = collectHumanScores(allSubs)
  const humanBySub = new Map<string, { avg: number | null; count: number }>()
  for (const s of allSubs) {
    const totals = flatHuman.filter((h) => h.submissionId === s.id).map((h) => h.total)
    humanBySub.set(s.id, { avg: average(totals), count: totals.length })
  }

  // submission_audits holds J1 evidence packs + J2 screening (best-effort).
  const auditsBySub = new Map<string, Record<string, unknown>>()
  try {
    const db = await getMongoDb()
    const audits = await db.collection('submission_audits').find({ hackathonId: hk.id }).toArray()
    for (const a of audits) {
      const rec = a as unknown as Record<string, unknown>
      if (typeof rec.submissionId === 'string' && rec.submissionId) auditsBySub.set(rec.submissionId, rec)
    }
  } catch { /* audits best-effort — reports mark evidence as unavailable */ }

  const screeningOf = (sid: string) => {
    const doc = auditsBySub.get(sid)
    const s = doc ? (doc.screening as Record<string, unknown> | undefined) : undefined
    if (!s || typeof s !== 'object') return null
    return {
      scores: Array.isArray(s.scores) ? (s.scores as Array<{ key?: unknown; score?: unknown; citation?: unknown }>) : [],
      total: typeof s.total === 'number' ? (s.total as number) : undefined,
      maxTotal: typeof s.maxTotal === 'number' ? (s.maxTotal as number) : undefined,
      notes: typeof s.notes === 'string' ? (s.notes as string) : undefined,
    }
  }
  const evidenceOf = (sid: string) => {
    const doc = auditsBySub.get(sid)
    if (!doc) return null
    const { _id, hackathonId, submissionId, screening, screenedBy, ...pack } = doc
    void _id
    void hackathonId
    void submissionId
    void screening
    void screenedBy
    return pack
  }
  const fmt1 = (n: unknown): string =>
    typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n * 10) / 10) : 'n/a'

  // Representative submission per team: highest stored score, latest first on ties.
  const bestSubByTeam = new Map<string, (typeof allSubs)[number]>()
  const byScore = [...allSubs].sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : -1
    const sb = typeof b.score === 'number' ? b.score : -1
    if (sb !== sa) return sb - sa
    const ta = String(a.submitted_at || '')
    const tb = String(b.submitted_at || '')
    return tb < ta ? -1 : tb > ta ? 1 : 0
  })
  for (const s of byScore) {
    if (s.team_id && !bestSubByTeam.has(s.team_id)) bestSubByTeam.set(s.team_id, s)
  }

  const winnerTeam = affectedTeams[0] || null
  const winnerSub = winnerTeam ? bestSubByTeam.get(String(winnerTeam.id)) || null : null
  const winnerScreen = winnerSub ? screeningOf(winnerSub.id) : null
  const winnerId = winnerSub ? String(winnerSub.id) : ''

  const reports: Array<Record<string, unknown>> = []

  for (let i = 0; i < affectedTeams.length; i++) {
    const team = affectedTeams[i]
    const rank = i + 1
    const resultsUrl = `/hackathons/${hk.slug}/results`
    const teamName = String(team.name || 'your team')
    const xp = typeof team.xp === 'number' ? team.xp : 0

    // Concise report line for the notification body (rank + total +
    // strongest dimension + one-line gap); full sections go in metadata + payload.
    let summary = ''
    const meta: Record<string, unknown> = {
      hackathon_id: hk.id,
      team_id: String(team.id),
      rank,
    }
    const sub = bestSubByTeam.get(String(team.id)) || null
    if (sub) {
      const myScreen = screeningOf(sub.id)
      const human = humanBySub.get(sub.id) || { avg: null, count: 0 }
      const finalScore = typeof sub.score === 'number' ? sub.score : null
      const total = myScreen && typeof myScreen.total === 'number' ? myScreen.total : null
      const report = buildProjectReport({
        submissionId: String(sub.id || ''),
        teamName,
        problemSlug: String(sub.problem_slug || ''),
        repoUrl: String(sub.repo_url || ''),
        liveUrl: String(sub.live_url || ''),
        videoUrl: String(sub.video_url || ''),
        screening: myScreen,
        humanAvg: human.avg,
        humanCount: human.count,
        finalScore,
        evidence: evidenceOf(sub.id),
        winnerId,
        winnerTeamName: winnerTeam ? String(winnerTeam.name || 'the winner') : 'the winner',
        winnerScores: winnerScreen && Array.isArray(winnerScreen.scores) ? winnerScreen.scores : null,
        rank,
        totalTeams: affectedTeams.length,
      })
      const entry: Record<string, unknown> = {
        team_id: String(team.id),
        team_name: teamName,
        rank,
        submission_id: String(sub.id),
        problem_slug: String(sub.problem_slug || ''),
        total,
        final_score: finalScore,
        human_avg: human.avg,
        human_count: human.count,
        strongest_dimension: report.strongestDimension,
        decisive_gap: report.decisiveGap,
        score_breakdown: report.scoreBreakdown,
        sections: report.sections,
        has_screening: myScreen !== null,
        has_evidence: auditsBySub.has(sub.id),
      }
      reports.push(entry)
      meta.submission_id = String(sub.id)
      meta.report = entry
      summary = ` Report — AI total ${fmt1(total)} · strongest: ${report.strongestDimension} · ${report.decisiveGap}`
    }

    const memberIds = (team.members || []).map((m) => (m ? m.user_id : '')).filter(Boolean)
    const notified = await notifyMany(memberIds, {
      type: 'hackathon.results',
      title: `Results released: ${hk.name}`,
      message: `Your team "${teamName}" ranked #${rank} of ${affectedTeams.length} with ${xp} XP.${summary}`,
      link: resultsUrl,
      icon: 'trophy',
      metadata: meta,
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
    reports,
  })
}
