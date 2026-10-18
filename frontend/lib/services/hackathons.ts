/**
 * Hackathons: create, update, release results. Extracted from
 * app/api/hackathons/route.ts (POST), app/api/hackathons/[id]/route.ts (PATCH)
 * and app/api/hackathons/[id]/release-results/route.ts (POST) — the routes and
 * the admin agent call the same functions (tenant checks, problem / judge
 * rules, XP, notifications and emails are identical).
 */
import 'server-only'
import { knowledgeOnEventChange } from '@/lib/rag/hooks'
import type { AnyBulkWriteOperation } from 'mongodb'
import {
  hackathons, hackathonTeams, hackathonSubmissions, newId, nowIso, newToken, xpToLevel, DEFAULT_FEATURES,
  type HackathonDoc, type HackathonTask, type HackathonRule, type HackathonFeatures, type HackathonSubmissionDoc,
} from '@/lib/db/qr-events'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'
import { checkTaskProblems, checkNewJudges } from '@/lib/hackathons/admin-checks'
import { isHackathonStaff, hasEnded, aiTotalsBySubmission } from '@/lib/hackathons/access'
import { sanitizeJudgingConfig } from '@/lib/hackathons/judge-config'
import { computeSubmissionFinal, rankTeams, type SubmissionFinal } from '@/lib/hackathons/final-scores'
import { normalizeSubmissionStatus, buildStatusUpdate } from '@/lib/hackathons/submission-state'
import { awardXp } from '@/lib/db/leaderboard'
import { notifyMany } from '@/lib/notifications'
import { buildProjectReport } from '@/lib/hackathons/reporting'
import { collectHumanScores, average } from '@/lib/hackathons/calibration'
import { getMongoDb } from '@/lib/mongodb'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'
import { addedJudges, emailNewJudges } from './judge-emails'

export function computeHackathonStatus(startsAt: string, endsAt: string, currentStatus?: string): 'draft' | 'open' | 'live' | 'closed' {
  if (currentStatus === 'draft') return 'draft'
  if (currentStatus === 'closed') return 'closed'
  const now = Date.now()
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  if (now >= end) return 'closed'
  if (now >= start) return 'live'
  return 'open'
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `event-${Math.random().toString(36).slice(2, 8)}`
  )
}

function mergeFeatures(defaults: HackathonFeatures, overrides?: Partial<HackathonFeatures>): HackathonFeatures {
  if (!overrides) return defaults
  return {
    ...defaults,
    ...overrides,
    rubric_criteria: overrides.rubric_criteria || defaults.rubric_criteria,
    sponsor_tracks: overrides.sponsor_tracks || defaults.sponsor_tracks,
  }
}

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'tenant_admin'].includes((role || '').toLowerCase())
}

/** Create a hackathon (POST /api/hackathons). */
export async function createHackathon(
  user: ServiceUser,
  body: Partial<HackathonDoc>,
  /** Agent only (the create form sets these later via PATCH): validated exactly as PATCH does. */
  extras: { judges?: string[]; judging_config?: unknown } = {},
): Promise<ServiceResult<HackathonDoc>> {
  if (!isAdmin(user.role)) return fail(403, 'Forbidden')
  // A tenant admin without a tenant would create an unowned (global) event.
  if (user.role === 'tenant_admin' && !user.tenantId) return fail(403, 'Forbidden')

  if (!body.name) return fail(400, 'name required')
  const numTeams = Math.min(1000, Math.max(1, Number(body.num_teams) || 8))
  const maxPerTeam = Math.min(20, Math.max(1, Number(body.max_per_team) || 4))
  const timeoutMin = Math.min(7 * 24 * 60, Math.max(5, Number(body.timeout_minutes) || 60))
  const startsAt = body.starts_at ? new Date(body.starts_at) : new Date()
  if (Number.isNaN(startsAt.getTime())) return fail(400, 'invalid starts_at')
  const endsAt = new Date(startsAt.getTime() + timeoutMin * 60_000)

  // Ensure unique slug.
  const col = await hackathons()
  let slug = slugify(body.name)
  let suffix = 0
  while (await col.findOne({ slug })) {
    suffix += 1
    slug = `${slugify(body.name)}-${suffix}`
  }

  const tasks: HackathonTask[] = (body.tasks || []).map((t: any, i: number) => ({
    problem_slug: String(t.problem_slug || ''),
    problem_title: String(t.problem_title || ''),
    points: Number(t.points) || 100,
    difficulty: String(t.difficulty || 'medium'),
    required: t.required !== false,
    order: i,
    ...(typeof t.time_limit_minutes === 'number' ? { time_limit_minutes: t.time_limit_minutes } : {}),
  }))

  const taskError = await checkTaskProblems(user, tasks.map((t) => t.problem_slug))
  if (taskError) return fail(403, taskError)

  const rulesHackathon: HackathonRule[] = (body.rules || []).map((r: any) => ({
    type: (r.type as HackathonRule['type']) || 'general',
    title: String(r.title || ''),
    description: String(r.description || ''),
  }))

  const doc: HackathonDoc = {
    id: newId(),
    name: body.name,
    slug,
    description: body.description || '',
    num_teams: numTeams,
    max_per_team: maxPerTeam,
    timeout_minutes: timeoutMin,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: computeHackathonStatus(startsAt.toISOString(), endsAt.toISOString(), body.status || 'open'),
    event_type: body.event_type === 'speed_contest' ? 'speed_contest' : 'hackathon',
    per_problem_time_minutes: Math.min(1440, Math.max(1, Number(body.per_problem_time_minutes) || 30)),
    solve_limit: body.solve_limit ? Number(body.solve_limit) : undefined,
    tasks,
    rules: rulesHackathon,
    scoring: {
      auto_grade: body.scoring?.auto_grade !== false,
      points_per_problem: Number(body.scoring?.points_per_problem) || 100,
      bonus_time: Number(body.scoring?.bonus_time) || 0,
      penalty_per_attempt: Number(body.scoring?.penalty_per_attempt) || 0,
    },
    results_released: false,
    banner_url: body.banner_url || '',
    cert_template: body.cert_template || (await getGeneralSettings()).certificate_template,
    features: mergeFeatures(DEFAULT_FEATURES, body.features),
    created_by: user.id,
    tenant_id: user.tenantId || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  if (Array.isArray(extras.judges)) {
    const judges = [...new Set(extras.judges.filter((j): j is string => typeof j === 'string' && j.trim().length > 0).map((j) => j.trim()))].slice(0, 100)
    const judgeError = await checkNewJudges(user, judges, [])
    if (judgeError) return fail(403, judgeError)
    doc.judges = judges
  }
  if (extras.judging_config !== undefined) doc.judging_config = sanitizeJudgingConfig(extras.judging_config)
  await col.insertOne(doc)
  knowledgeOnEventChange('hackathon', doc.id, doc.tenant_id)
  if (doc.judges?.length) await emailNewJudges(doc, doc.judges)
  const { _id: _omit, ...clean } = doc as HackathonDoc & { _id?: unknown }
  void _omit
  return ok(clean as HackathonDoc, 201)
}

/** Update a hackathon (PATCH /api/hackathons/[id]). Returns the updated doc. */
export async function updateHackathon(user: ServiceUser, id: string, body: Partial<HackathonDoc>): Promise<ServiceResult<HackathonDoc | null>> {
  const $set: Record<string, unknown> = { updated_at: nowIso() }

  // Fetch current document first for validation
  const col = await hackathons()
  const cur = await col.findOne({ id })
  if (!cur) return fail(404, 'not found')

  // Superadmin, or this event's own tenant admin (deny by default).
  if (!isHackathonStaff(user, cur)) return fail(403, 'Forbidden')

  // Status changes with validation. The edit form always sends the current
  // status, so an unchanged status is a no-op rather than a 409.
  const statusChanged = typeof body.status === 'string' && body.status !== cur.status
  if (statusChanged && typeof body.status === 'string') {
    const validStatuses = ['draft', 'open', 'live', 'closed']
    if (!validStatuses.includes(body.status)) return fail(400, 'Invalid status')
    const validTransitions: Record<string, string[]> = {
      draft: ['open', 'closed'],
      open: ['live', 'draft', 'closed'],
      live: ['closed', 'open', 'draft'],
      closed: ['open'],
    }
    if (!validTransitions[cur.status]?.includes(body.status)) {
      return fail(409, `Cannot change status from ${cur.status} to ${body.status}`)
    }
    if (cur.results_released && body.status !== 'closed') {
      return fail(409, 'Results are released; the event stays closed')
    }
    $set.status = body.status
  }

  const clampInt = (v: unknown, lo: number, hi: number): number | null => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null
  }
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    if (!name) return fail(400, 'Name is required')
    $set.name = name
  }
  if ('description' in body) $set.description = typeof body.description === 'string' ? body.description.slice(0, 20000) : ''
  if ('num_teams' in body) {
    const n = clampInt(body.num_teams, 1, 10000)
    if (n === null) return fail(400, 'num_teams must be a number')
    $set.num_teams = n
  }
  if ('max_per_team' in body) {
    const n = clampInt(body.max_per_team, 1, 50)
    if (n === null) return fail(400, 'max_per_team must be a number')
    $set.max_per_team = n
  }
  if ('event_type' in body) $set.event_type = body.event_type === 'speed_contest' ? 'speed_contest' : 'hackathon'
  if ('per_problem_time_minutes' in body) $set.per_problem_time_minutes = clampInt(body.per_problem_time_minutes, 1, 1440) ?? 30
  if ('cert_template' in body && typeof body.cert_template === 'string') $set.cert_template = body.cert_template.slice(0, 30)
  if ('solve_limit' in body) $set.solve_limit = body.solve_limit == null ? undefined : clampInt(body.solve_limit, 0, 1000) ?? undefined
  if ('grace_period_minutes' in body) $set.grace_period_minutes = clampInt(body.grace_period_minutes, 0, 1440) ?? 0
  if ('allow_late_submissions' in body) $set.allow_late_submissions = body.allow_late_submissions === true
  if (Array.isArray(body.judges)) {
    const judges = [...new Set(body.judges.filter((j): j is string => typeof j === 'string' && j.trim().length > 0).map((j) => j.trim()))].slice(0, 100)
    // Company admins may only add judges from their own organization.
    const judgeError = await checkNewJudges(user, judges, cur.judges || [])
    if (judgeError) return fail(403, judgeError)
    $set.judges = judges
  }
  if (body.timeout_minutes != null && clampInt(body.timeout_minutes, 1, 60 * 24 * 60) === null) {
    return fail(400, 'timeout_minutes must be a number')
  }
  // J3/J4 judging config (validated; published to all viewers via GET).
  if ('judging_config' in body) {
    $set.judging_config = sanitizeJudgingConfig(
      (body as unknown as { judging_config?: unknown }).judging_config,
    )
  }

  if (Array.isArray(body.tasks)) {
    // Company admins: platform problems + their own organization's only. Tasks
    // already on the event (e.g. added by a superadmin) stay allowed.
    const existingSlugs = new Set((cur.tasks || []).map((t) => t.problem_slug))
    const taskError = await checkTaskProblems(user, body.tasks.map((t: any) => String(t?.problem_slug || '')).filter((s: string) => !existingSlugs.has(s)))
    if (taskError) return fail(403, taskError)
    $set.tasks = body.tasks.map((t: any, i: number) => ({
      problem_slug: String(t.problem_slug || ''),
      problem_title: String(t.problem_title || ''),
      points: Number(t.points) || 100,
      difficulty: String(t.difficulty || 'medium'),
      required: t.required !== false,
      order: i,
      ...(typeof t.time_limit_minutes === 'number' ? { time_limit_minutes: t.time_limit_minutes } : {}),
    }))
  }
  if (Array.isArray(body.rules)) {
    $set.rules = body.rules.map((r: any) => ({
      type: (r.type || 'general') as 'scoring' | 'submission' | 'conduct' | 'general',
      title: String(r.title || ''),
      description: String(r.description || ''),
    }))
  }
  if (body.scoring && typeof body.scoring === 'object') {
    const s = body.scoring as any
    $set.scoring = {
      auto_grade: s.auto_grade !== false,
      points_per_problem: Number(s.points_per_problem) || 100,
      bonus_time: Number(s.bonus_time) || 0,
      penalty_per_attempt: Number(s.penalty_per_attempt) || 0,
    }
  }
  if ('banner_url' in body) {
    $set.banner_url = typeof body.banner_url === 'string' ? body.banner_url : ''
  }
  if (body.features && typeof body.features === 'object') {
    $set.features = {
      ...DEFAULT_FEATURES,
      ...body.features,
      rubric_criteria: body.features.rubric_criteria || DEFAULT_FEATURES.rubric_criteria,
      sponsor_tracks: body.features.sponsor_tracks || DEFAULT_FEATURES.sponsor_tracks,
    }
  }
  // Recompute ends_at if timeout or starts_at changed.
  const newTimeout = body.timeout_minutes != null ? (clampInt(body.timeout_minutes, 1, 60 * 24 * 60) as number) : cur.timeout_minutes
  const newStart = body.starts_at ? new Date(body.starts_at) : new Date(cur.starts_at)
  if (body.timeout_minutes != null || body.starts_at != null) {
    if (Number.isNaN(newStart.getTime())) return fail(400, 'invalid starts_at')
    $set.starts_at = newStart.toISOString()
    $set.timeout_minutes = newTimeout
    $set.ends_at = new Date(newStart.getTime() + newTimeout * 60_000).toISOString()
  }

  await col.updateOne({ id }, { $set })
  knowledgeOnEventChange('hackathon', id)
  // Email judges added by this change only (existing judges are not re-emailed).
  const newJudges = Array.isArray($set.judges) ? addedJudges($set.judges as string[], cur.judges || []) : []
  // Recalculate status from new dates — unless the organiser just set one by hand.
  const after = await col.findOne({ id }, { projection: { _id: 0 } })
  if (after && !statusChanged) {
    const computed = computeHackathonStatus(after.starts_at, after.ends_at, after.status)
    if (computed !== after.status) {
      await col.updateOne({ id }, { $set: { status: computed, updated_at: nowIso() } })
      after.status = computed
    }
  }
  if (after && newJudges.length) await emailNewJudges(after, newJudges)
  return ok(after as HackathonDoc | null)
}

// ─── Results release ─────────────────────────────────────────────────────────

export interface HackathonReleasePreview {
  ended: boolean
  unscored: number
  to_release: number
  teams: number
  reasons: string[]
  already_released: boolean
}

async function finalsFor(hk: HackathonDoc) {
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
  const reasons: string[] = []
  if (!hasEnded(hk)) reasons.push('The event has not ended yet; teams can still submit.')
  if (unscored > 0) reasons.push(`${unscored} submission${unscored === 1 ? ' has' : 's have'} no score yet and will show as not scored.`)
  return { cfg, subsCol, pool, finals, unscored, reasons }
}

async function loadStaffHackathon(user: ServiceUser, idOrSlug: string): Promise<ServiceResult<HackathonDoc>> {
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] })
  if (!hk) return fail(404, 'not found')
  // Superadmin, or this event's own tenant admin (deny by default).
  if (!isHackathonStaff(user, hk)) return fail(403, 'Forbidden')
  return ok(hk as HackathonDoc)
}

/** What a release would do now (reads only). */
export async function previewHackathonRelease(user: ServiceUser, idOrSlug: string): Promise<ServiceResult<HackathonReleasePreview>> {
  const loaded = await loadStaffHackathon(user, idOrSlug)
  if (!loaded.ok) return loaded
  const hk = loaded.data
  const { pool, unscored, reasons } = await finalsFor(hk)
  const toRelease = pool.filter((s) => {
    const st = normalizeSubmissionStatus(s.status)
    return st !== 'rejected' && st !== 'released'
  }).length
  const teams = await (await hackathonTeams()).countDocuments({ hackathon_id: hk.id })
  return ok({ ended: hasEnded(hk), unscored, to_release: toRelease, teams, reasons, already_released: !!hk.results_released })
}

/** Release results (POST /api/hackathons/[id]/release-results). */
export async function releaseHackathonResults(
  user: ServiceUser,
  idOrSlug: string,
  opts: { force?: boolean } = {},
): Promise<ServiceResult<Record<string, unknown>>> {
  const loaded = await loadStaffHackathon(user, idOrSlug)
  if (!loaded.ok) return loaded
  const hk = loaded.data
  const col = await hackathons()
  if (hk.results_released) return fail(409, 'Results are already released')

  const force = opts.force === true
  const { cfg, subsCol, pool, finals, unscored, reasons } = await finalsFor(hk)

  // Guard rails — the organiser confirms and re-sends with { force: true }.
  if (reasons.length > 0 && !force) {
    return fail(409, reasons.join(' '), { error: reasons.join(' '), code: 'confirm_release', reasons, unscored })
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
  knowledgeOnEventChange('hackathon', hk.id, hk.tenant_id)

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

  return ok({
    ok: true,
    released_at: releasedAt,
    submissions_released: ops.length,
    unscored,
    teams_affected: affectedTeams.length,
    emails_sent: emailsSent,
    reports,
  })
}
