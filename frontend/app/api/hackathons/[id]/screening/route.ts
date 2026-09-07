import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonSubmissions } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { screenEvidencePack } from '@/lib/hackathons/ai-screening'

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

async function checkJudgeOrAdmin(hackathonId: string, user: { id: string; role?: string; tenantId?: string }) {
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id: hackathonId }, { slug: hackathonId }] })
  if (!hk) return { error: 'not found', status: 404 } as const
  if (user.role === 'tenant_admin' && user.tenantId && hk.tenant_id !== user.tenantId) {
    return { error: 'Forbidden', status: 403 } as const
  }
  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)
  if (!isAdmin && !isJudge) {
    return { error: 'Forbidden', status: 403 } as const
  }
  return { hk }
}

/** Name the failing layer; keep provider/model detail, drop anything key-like. */
function screeningErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? (e.message || 'unknown error') : String(e ?? 'unknown error')
  const scrubbed = (raw || '')
    .replace(/(sk-[A-Za-z0-9-_]{4})[A-Za-z0-9-_]+/g, '$1…')
    .replace(/(bearer\s+[A-Za-z0-9-_.=]{4})[A-Za-z0-9-_.=]+/gi, '$1…')
    .replace(/(api[_-]?key["'\s:=]+[A-Za-z0-9-_]{3})[A-Za-z0-9-_.]+/gi, '$1…')
  return `AI screening failed: ${scrubbed.slice(0, 200)}`
}

/** Strip audit-doc bookkeeping fields down to the evidence pack. */
function toPack(doc: Record<string, unknown>): Record<string, unknown> {
  const { _id, hackathonId, submissionId, screening, screenedBy, ...pack } = doc
  void _id
  void hackathonId
  void submissionId
  void screening
  void screenedBy
  return pack
}

/** Build the screening input from actual submission fields (comment = description; tech from evidence). */
function toScreeningInput(
  sub: Record<string, unknown>,
  pack: Record<string, unknown>,
): { description?: string; techStack?: string; videoUrl?: string; liveUrl?: string } {
  const repo = (pack.repo || null) as { language?: unknown; topics?: unknown } | null
  const docs = (pack.docs || null) as { manifests?: unknown } | null
  const techBits: string[] = []
  if (repo && typeof repo.language === 'string' && repo.language) techBits.push(repo.language)
  if (repo && Array.isArray(repo.topics)) {
    for (const t of repo.topics) {
      if (typeof t === 'string' && t) techBits.push(t)
    }
  }
  if (docs && Array.isArray(docs.manifests)) {
    for (const m of docs.manifests) {
      if (typeof m === 'string' && m) techBits.push(m)
    }
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const video = str(sub.video_url).trim()
  const live = str(sub.live_url).trim()
  return {
    description: str(sub.comment).trim() || str(sub.problem_slug).trim() || undefined,
    techStack: techBits.length > 0 ? techBits.join(', ') : undefined,
    ...(video ? { videoUrl: video } : {}),
    ...(live ? { liveUrl: live } : {}),
  }
}

function boardRow(doc: Record<string, unknown>, teamId: string | null) {
  const s = (doc.screening || null) as {
    scores?: unknown
    total?: unknown
    maxTotal?: unknown
    screenedAt?: unknown
    notes?: unknown
  } | null
  if (!s || typeof s !== 'object') return null
  return {
    submissionId: doc.submissionId,
    teamId,
    total: typeof s.total === 'number' ? s.total : null,
    maxTotal: typeof s.maxTotal === 'number' ? s.maxTotal : null,
    scores: Array.isArray(s.scores) ? s.scores : [],
    screenedAt: typeof s.screenedAt === 'string' ? s.screenedAt : null,
    notes: typeof s.notes === 'string' ? s.notes : '',
  }
}

/**
 * GET: screening leaderboard — all submission_audits for the hackathon WITH
 * a screening field, sorted by total desc.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const gate = await checkJudgeOrAdmin(id, user as { id: string; role?: string; tenantId?: string })
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const col = await auditsCol()
  const docs = await col
    .find({ hackathonId: gate.hk.id, screening: { $exists: true } })
    .toArray()

  let teamBySub = new Map<string, string>()
  try {
    const subsCol = await hackathonSubmissions()
    const subs = await subsCol.find({ hackathon_id: gate.hk.id }).toArray()
    teamBySub = new Map(
      subs
        .filter((s) => typeof s.id === 'string')
        .map((s) => [s.id as string, (typeof s.team_id === 'string' ? s.team_id : '') as string]),
    )
  } catch { /* team lookup best-effort */ }

  const items = docs
    .map((d) => boardRow(d as Record<string, unknown>, teamBySub.get(d.submissionId as string) || null))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1))

  return NextResponse.json({ items })
}

/**
 * POST { submissionId }: screen one audited submission.
 * POST { all: true }: screen every audited-but-unscreened submission (cap 20,
 * sequential to respect LLM rate limits, per-submission ok/error).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  const rateCheck = await rateLimitAIRedis(req, userId)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  const { id } = await ctx.params
  const gate = await checkJudgeOrAdmin(id, user as { id: string; role?: string; tenantId?: string })
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const hk = gate.hk

  let body: { submissionId?: string; all?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const col = await auditsCol()
  const subsCol = await hackathonSubmissions()

  async function screenOne(submissionId: string) {
    const cached = await col.findOne({ hackathonId: hk.id, submissionId })
    if (!cached) {
      const err = new Error('run repo audit first') as Error & { status?: number }
      err.status = 404
      throw err
    }
    const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
    if (!sub) {
      const err = new Error('submission not found') as Error & { status?: number }
      err.status = 404
      throw err
    }
    const pack = toPack(cached as Record<string, unknown>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await screenEvidencePack(pack as any, toScreeningInput(sub as Record<string, unknown>, pack))
    const screening = { ...result, screenedBy: userId }
    try {
      await col.updateOne(
        { hackathonId: hk.id, submissionId },
        { $set: { screening } },
      )
    } catch (e) {
      console.error('[ai-screening] cache write failed', e)
      // Still return the result — caching is best-effort.
    }
    return screening
  }

  // Bulk run.
  if (body && body.all === true) {
    const pending = await col
      .find({ hackathonId: hk.id, screening: { $exists: false } })
      .limit(20)
      .toArray()
    const results: Array<Record<string, unknown>> = []
    for (const doc of pending) {
      const submissionId = (doc as Record<string, unknown>).submissionId as string
      try {
        const screening = await screenOne(submissionId)
        results.push({ submissionId, ok: true, total: screening.total, screening })
      } catch (e) {
        const status = (e as Error & { status?: number }).status
        results.push({
          submissionId,
          ok: false,
          error: status === 404 && e instanceof Error ? e.message : screeningErrorMessage(e),
          ...(status ? { status } : {}),
        })
      }
    }
    return NextResponse.json({ ok: true, results })
  }

  const submissionId = typeof body?.submissionId === 'string' ? body.submissionId.trim() : ''
  if (!submissionId) {
    return NextResponse.json({ error: 'submissionId required (or { all: true })' }, { status: 400 })
  }
  try {
    const screening = await screenOne(submissionId)
    return NextResponse.json({ ok: true, submissionId, screening })
  } catch (e) {
    const status = (e as Error & { status?: number }).status
    if (status === 404) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'not found' }, { status: 404 })
    }
    console.error('[ai-screening]', e)
    return NextResponse.json({ error: screeningErrorMessage(e) }, { status: 502 })
  }
}
