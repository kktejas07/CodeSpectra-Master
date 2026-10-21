import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonSubmissions } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { backendComplete } from '@/lib/ai/backend'
import { SCREENING_CRITERIA } from '@/lib/hackathons/ai-screening'
import { collectHumanScores, average } from '@/lib/hackathons/calibration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function auditsCol() {
  const db = await getMongoDb()
  const col = db.collection('submission_audits')
  try {
    await col.createIndex({ hackathonId: 1, submissionId: 1 }, { unique: true, name: 'submission_audits_unique' })
  } catch { /* index may already exist */ }
  return col
}

/** Local JSON extractor (mirrors the ai-screening helper; keeps this route light). */
function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const trimmed = raw.trim()
    const first = trimmed.charCodeAt(0)
    if (first === 123 || first === 91) return JSON.parse(trimmed)
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch {
    return null
  }
  return null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Compact, prompt-sized summary of one side of the comparison. */
function summarizeSide(
  tag: string,
  sub: Record<string, unknown>,
  teamName: string,
  audit: Record<string, unknown> | null,
): Record<string, unknown> {
  const screening = (audit && typeof audit.screening === 'object' ? audit.screening : null) as {
    scores?: Array<{ key?: unknown; score?: unknown; citation?: unknown }>
    total?: unknown
    maxTotal?: unknown
    notes?: unknown
  } | null
  const human = collectHumanScores([sub])
  const humanAvg = average(human.map((h) => h.total))
  const commits = (audit ? (audit.commits as Record<string, unknown> | null) : null) || null
  const freshness = (audit ? (audit.freshness as Record<string, unknown> | null) : null) || null
  const secrets = (audit ? (audit.secrets as Record<string, unknown> | null) : null) || null
  const docs = (audit ? (audit.docs as Record<string, unknown> | null) : null) || null
  const vulns = (audit ? (audit.vulns as Record<string, unknown> | null) : null) || null
  const repo = (audit ? (audit.repo as Record<string, unknown> | null) : null) || null
  return {
    tag,
    team: teamName,
    problem: str(sub.problem_slug),
    description: str(sub.comment).slice(0, 500),
    aiTotal: typeof (screening ? screening.total : null) === 'number' ? screening!.total : null,
    aiMax: typeof (screening ? screening.maxTotal : null) === 'number' ? screening!.maxTotal : null,
    aiScores: Array.isArray(screening ? screening.scores : null)
      ? (screening!.scores || []).slice(0, 6).map((c) => ({
        key: str(c.key),
        score: typeof c.score === 'number' ? c.score : null,
        citation: str(c.citation).slice(0, 200),
      }))
      : [],
    aiNotes: screening ? str(screening.notes).slice(0, 300) : '',
    humanAvg,
    humanCount: human.length,
    evidence: audit
      ? {
        commits: commits ? { total: commits.total ?? null, eventCommits: commits.eventCommits ?? null } : null,
        freshness: freshness ? { reason: str(freshness.reason).slice(0, 200), likelyPreexisting: freshness.likelyPreexisting === true } : null,
        secrets: secrets ? { critical: secrets.critical ?? 0, high: secrets.high ?? 0, medium: secrets.medium ?? 0 } : null,
        docs: docs ? { readme: docs.readme === true, tests: docs.tests === true, ci: docs.ci === true } : null,
        vulns: vulns && typeof vulns.count === 'number' ? vulns.count : null,
        language: repo ? str(repo.language) : '',
      }
      : 'no repo audit — judge without repo facts',
  }
}

/**
 * POST { aSubmissionId, bSubmissionId, criterion? } — judge/admin only.
 * Head-to-head tie-break: ONE backendComplete call comparing A vs B on one
 * criterion (default 'implementation'), citing evidence. Ties allowed.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const userId = user.id

  const rateCheck = await rateLimitAIRedis(req, userId)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 })
  if (user.role === 'tenant_admin' && (!user.tenantId || hk.tenant_id !== user.tenantId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }
  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)
  if (!isAdmin && !isJudge) {
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  }

  let body: { aSubmissionId?: unknown; bSubmissionId?: unknown; criterion?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON', code: 'invalid_json' }, { status: 400 })
  }
  const aId = str(body.aSubmissionId).trim()
  const bId = str(body.bSubmissionId).trim()
  if (!aId || !bId) {
    return NextResponse.json({ error: 'aSubmissionId and bSubmissionId required' }, { status: 400 })
  }
  if (aId === bId) {
    return NextResponse.json({ error: 'pick two different submissions' }, { status: 400 })
  }
  const critKey = str(body.criterion).trim() || 'implementation'
  const criterion = SCREENING_CRITERIA.find((c) => c.key === critKey) || SCREENING_CRITERIA.find((c) => c.key === 'implementation')!

  const subsCol = await hackathonSubmissions()
  const [subA, subB] = await Promise.all([
    subsCol.findOne({ id: aId, hackathon_id: hk.id }),
    subsCol.findOne({ id: bId, hackathon_id: hk.id }),
  ])
  if (!subA || !subB) {
    return NextResponse.json({ error: 'one or both submissions not found' }, { status: 404 })
  }

  let teamA = 'Unknown'
  let teamB = 'Unknown'
  try {
    const { hackathonTeams } = await import('@/lib/db/qr-events')
    const teamsCol = await hackathonTeams()
    const teams = await teamsCol
      .find({ id: { $in: [subA.team_id, subB.team_id].filter(Boolean) } })
      .toArray()
    for (const t of teams) {
      if (t.id === subA.team_id) teamA = t.name || teamA
      if (t.id === subB.team_id) teamB = t.name || teamB
    }
  } catch { /* names best-effort */ }

  let auditA: Record<string, unknown> | null = null
  let auditB: Record<string, unknown> | null = null
  try {
    const aCol = await auditsCol()
    const [dA, dB] = await Promise.all([
      aCol.findOne({ hackathonId: hk.id, submissionId: aId }),
      aCol.findOne({ hackathonId: hk.id, submissionId: bId }),
    ])
    auditA = (dA as Record<string, unknown> | null) || null
    auditB = (dB as Record<string, unknown> | null) || null
  } catch { /* missing audits degrade to no-evidence notes */ }

  const sideA = summarizeSide('A', subA as Record<string, unknown>, teamA, auditA)
  const sideB = summarizeSide('B', subB as Record<string, unknown>, teamB, auditB)
  let brief = ''
  try {
    brief = JSON.stringify({ A: sideA, B: sideB }).slice(0, 6000)
  } catch {
    brief = '{"error":"summaries unserializable"}'
  }

  let res
  try {
    res = await backendComplete({
      systemMessage:
        'You are a hackathon head judge breaking a tie. Compare ONLY what the evidence supports. ' +
        'A tie is allowed when the evidence does not separate the two submissions.',
      userMessage:
        `Compare submission A vs submission B on "${criterion.label}" for a hackathon. ` +
        `Cite specific evidence (files, commits, metrics, scores) for every claim.\n\n` +
        `Evidence:\n${brief}\n\n` +
        `Return ONLY a valid JSON object: {"winner": "A" | "B" | "tie", "reason": "<1-3 sentences citing evidence>"}`,
      modelRole: 'reasoning',
      responseFormat: 'json',
      feature: 'hackathon-judge-compare',
    })
  } catch (e) {
    console.error('[judge-compare]', e)
    return NextResponse.json({ error: 'compare model call failed' }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'compare model call failed' }, { status: 502 })
  }
  const parsed =
    (res.json as Record<string, unknown> | null) ||
    extractJson(res.raw || (typeof res.text === 'string' ? res.text : '') || '')
  const rawWinner = parsed ? str(parsed.winner).trim().toLowerCase() : ''
  const winner: 'A' | 'B' | 'tie' = rawWinner === 'a' ? 'A' : rawWinner === 'b' ? 'B' : 'tie'
  const reason = parsed ? str(parsed.reason).trim().slice(0, 1000) : ''
  return NextResponse.json({
    winner,
    reason: reason || 'no reason given',
    aSubmissionId: aId,
    bSubmissionId: bId,
    criterion: criterion.key,
  })
}
