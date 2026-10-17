import { NextResponse } from 'next/server'
import type { AnyBulkWriteOperation } from 'mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams, hackathonSubmissions, nowIso, newToken, xpToLevel, type HackathonSubmissionDoc } from '@/lib/db/qr-events'
import { awardXp } from '@/lib/db/leaderboard'
import { isHackathonStaff, hasEnded, aiTotalsBySubmission } from '@/lib/hackathons/access'
import { computeSubmissionFinal, rankTeams, type SubmissionFinal } from '@/lib/hackathons/final-scores'
import { normalizeSubmissionStatus, buildStatusUpdate } from '@/lib/hackathons/submission-state'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'
import { hackathonEmailTemplates } from '@/lib/email-templates'
import { notifyMany } from '@/lib/notifications'
import { buildProjectReport } from '@/lib/hackathons/reporting'
import { collectHumanScores, average } from '@/lib/hackathons/calibration'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // Superadmin, or this event's own tenant admin (deny by default).
  if (!isHackathonStaff(user, hk)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (hk.results_released) return NextResponse.json({ error: 'Results are already released' }, { status: 409 })

  const body = (await req.json().catch(() => ({}))) as { force?: unknown }
  const force = body?.force === true

  const cfg = sanitizeJudgingConfig(hk.judging_config)
  const aiTotals = await aiTotalsBySubmission(hk.id)
  const subsCol = await hackathonSubmissions()
  const pool = await subsCol.find({ hackathon_id: hk.id }).toArray()

  // Final judged score per submission (judges averaged, high/low trimmed per
  // config, blended with AI screening, auto-grade as the fallback).
  const finals = new Map<string, SubmissionFinal>()
  let unscored = 0
  for (const s of pool) {
    const f = computeSubmissionFinal(s as unknown as Record<string, unknown>, aiTotals.get(s.id), cfg)
    finals.set(s.id, f)
    const st = normalizeSubmissionStatus(s.status)
    if (st !== 'rejected' && st !== 'released' && f.final_score === null) unscored++
  }

  // Guard rails — the organiser confirms and re-sends with { force: true }.
  const reasons: string[] = []
  if (!hasEnded(hk)) reasons.push('The event has not ended yet; teams can still submit.')
  if (unscored > 0) reasons.push(`${unscored} submission${unscored === 1 ? ' has' : 's have'} no score yet and will show as not scored.`)
  if (reasons.length > 0 && !force) {
    return NextResponse.json({ error: reasons.join(' '), code: 'confirm_release', reasons, unscored }, { status: 409 })
  }

  // Release every non-rejected submission, keeping the judge scores.
  const now = nowIso()
  const ops: AnyBulkWriteOperation<HackathonSubmissionDoc>[] = []
  for (const s of pool) {
    const st = normalizeSubmissionStatus(s.status)
    if (st === 'rejected' || st === 'released') continue
    const f = finals.get(s.id)!
    const u = buildStatusUpdate('released', user.id, now, {
      final_score: f.final_score,
      final_points: f.final_points,
      human_avg: f.human_avg,
      score: f.final_points,
      released_at: now,
    })
    ops.push({ updateOne: { filter: { id: s.id }, update: u as any } })
  }
  if (ops.length > 0) await subsCol.bulkWrite(ops, { ordered: false })

  const releasedAt = now
  await col.updateOne({ id: hk.id }, { $set: { results_released: true, released_at: releasedAt, updated_at: now } })

  // Rank teams on judged totals (never XP), then store the standing on each team.
  const teamsCol = await hackathonTeams()
  const teamRows = await teamsCol.find({ hackathon_id: hk.id }).toArray()
  const allSubs = await subsCol.find({ hackathon_id: hk.id }).toArray()
  const standings = rankTeams(teamRows.map((t) => t.id), allSubs, cfg)
  const teamById = new Map(teamRows.map((t) => [t.id, t]))
  const affectedTeams = standings.map((st) => teamById.get(st.team_id)!).filter(Boolean)
  const standingOf = new Map(standings.map((st) => [st.team_id, st]))

  for (const st of standings) {
    const t = teamById.get(st.team_id)
    if (!t) continue
    const xpGain = st.total && st.total > 0 ? Math.round(st.total) : 0
    const nextXp = (t.xp || 0) + xpGain
    await teamsCol.updateOne({ id: t.id }, {
      $set: {
        final_total: st.total, final_rank: st.rank, final_tied: st.tied, advancing: st.advancing,
        xp: nextXp, level: xpToLevel(nextXp), updated_at: now,
        // Certificate verify token, separate from the join secret (qr_token).
        verify_token: (t as { verify_token?: string }).verify_token || newToken(),
      } as Record<string, unknown>,
    })
    // XP is server-awarded once, here, from the judged total.
    if (xpGain > 0) {
      for (const m of t.members || []) {
        await awardXp({
          userId: m.user_id, amount: xpGain, reason: 'hackathon_score',
          metadata: { hackathon_id: hk.id, team_id: t.id, rank: st.rank },
        }).catch(() => {})
      }
    }
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  void appUrl
  let emailsSent = 0

  // Per-project report summaries — deterministic, built from stored judging
  // state only (no new AI calls). Absent screening/evidence is marked via
  // has_screening/has_evidence and rendered as "unavailable" — never fabricated.
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
    const sa = typeof a.final_points === 'number' ? a.final_points : -1
    const sb = typeof b.final_points === 'number' ? b.final_points : -1
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
    const standing = standingOf.get(String(team.id))
    const rank = standing?.rank ?? null
    const resultsUrl = `/hackathons/${hk.slug}/results`
    const teamName = String(team.name || 'your team')
    const total = standing?.total ?? null

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
      const finalScore = typeof sub.final_score === 'number' ? sub.final_score : null
      const aiTotal = myScreen && typeof myScreen.total === 'number' ? myScreen.total : null
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
        rank: rank ?? affectedTeams.length,
        totalTeams: affectedTeams.length,
      })
      const entry: Record<string, unknown> = {
        team_id: String(team.id),
        team_name: teamName,
        rank,
        submission_id: String(sub.id),
        problem_slug: String(sub.problem_slug || ''),
        total: aiTotal,
        final_score: finalScore,
        team_total: total,
        advancing: !!standing?.advancing,
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
      summary = ` Report — AI total ${fmt1(aiTotal)} · strongest: ${report.strongestDimension} · ${report.decisiveGap}`
    }

    const memberIds = (team.members || []).map((m) => (m ? m.user_id : '')).filter(Boolean)
    const notified = await notifyMany(memberIds, {
      type: 'hackathon.results',
      title: `Results released: ${hk.name}`,
      message: rank !== null
        ? `Your team "${teamName}" ranked #${rank}${standing?.tied ? ' (tied)' : ''} of ${affectedTeams.length} with ${fmt1(total)} points.${summary}`
        : `Results are out. Your team "${teamName}" wasn't ranked (no scored submission).`,
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
    submissions_released: ops.length,
    unscored,
    teams_affected: affectedTeams.length,
    emails_sent: emailsSent,
    reports,
  })
}
