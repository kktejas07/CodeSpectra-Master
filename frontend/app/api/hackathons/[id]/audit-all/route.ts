import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonSubmissions, hackathonTeams } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'
import { auditSubmissionRepo } from '@/lib/hackathons/repo-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 25

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
  if (!hk) return { error: 'not found', code: 'not_found', status: 404 } as const
  if (user.role === 'tenant_admin' && (!user.tenantId || hk.tenant_id !== user.tenantId)) {
    return { error: 'Forbidden', code: 'forbidden', status: 403 } as const
  }
  const isAdmin = ['superadmin', 'tenant_admin'].includes((user.role || '').toLowerCase())
  const isJudge = (hk.judges || []).includes(user.id)
  if (!isAdmin && !isJudge) {
    return { error: 'Forbidden', code: 'forbidden', status: 403 } as const
  }
  return { hk }
}

/**
 * POST { limit? }: audit every submission WITHOUT a cached audit, first N
 * (default 12, max 25), SEQUENTIALLY. Stops early on the first pack with
 * rateLimited=true so a dead GitHub quota doesn't burn further calls.
 * Repeat clicks resume where the last run stopped (cached audits are skipped).
 * Returns { audited: [{submissionId, ok}], skipped, stoppedOn, remaining }.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  const { id } = await ctx.params
  const gate = await checkJudgeOrAdmin(id, user as { id: string; role?: string; tenantId?: string })
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const hk = gate.hk

  let body: { limit?: unknown }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const rawLimit = body && typeof body.limit === 'number' ? body.limit : DEFAULT_LIMIT
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit) || DEFAULT_LIMIT))

  const subsCol = await hackathonSubmissions()
  const col = await auditsCol()

  const subs = await subsCol.find({ hackathon_id: hk.id }).toArray()
  const existing = await col
    .find({ hackathonId: hk.id })
    .project({ submissionId: 1 })
    .toArray()
  const existingIds = new Set(
    (existing || [])
      .map((d) => (d as Record<string, unknown>).submissionId)
      .filter((v): v is string => typeof v === 'string'),
  )

  const pending = (subs || []).filter(
    (s) => typeof s.id === 'string' && !existingIds.has(s.id as string),
  )
  const alreadyCached = (subs || []).length - pending.length
  const attemptable = pending.filter((s) => ((s.repo_url || '') as string).trim() !== '')
  const noRepoSkipped = pending.length - attemptable.length
  const skipped = alreadyCached + noRepoSkipped
  const batch = attemptable.slice(0, limit)

  // Team sizes in one query (fallback: event max_per_team).
  const teamById = new Map<string, number>()
  try {
    const teamsCol = await hackathonTeams()
    const teamIds = [...new Set(batch.map((s) => s.team_id).filter((v): v is string => typeof v === 'string' && v !== ''))]
    if (teamIds.length > 0) {
      const teams = await teamsCol.find({ id: { $in: teamIds } }).toArray()
      for (const t of teams || []) {
        if (typeof t.id === 'string' && Array.isArray(t.members) && t.members.length > 0) {
          teamById.set(t.id, t.members.length)
        }
      }
    }
  } catch { /* keep max_per_team fallback */ }
  const fallbackSize = typeof hk.max_per_team === 'number' ? hk.max_per_team : 0

  // Judge's own GitHub OAuth token (same source as the per-submission route).
  let githubToken: string | undefined
  try {
    const gh = await getGitHubAccessTokenFromSession()
    if (gh.ok) githubToken = gh.accessToken
  } catch { /* unauthenticated GitHub access still works for public repos */ }

  const audited: Array<{ submissionId: string; ok: boolean; error?: string }> = []
  let stoppedOn: 'github-rate-limit' | null = null
  let newlyCached = 0

  for (const sub of batch) {
    const submissionId = sub.id as string
    const repoUrl = ((sub.repo_url || '') as string).trim()
    const teamSize = (typeof sub.team_id === 'string' && teamById.get(sub.team_id)) || fallbackSize
    try {
      const pack = await auditSubmissionRepo({
        repoUrl,
        eventStartISO: hk.starts_at || '',
        eventEndISO: hk.ends_at || '',
        teamSize,
        githubToken,
      })
      if (pack.rateLimited === true) {
        // Do NOT cache the partial pack — the retry must pick this row up again.
        audited.push({
          submissionId,
          ok: false,
          error: 'GitHub API rate limit hit — connect GitHub OAuth for 5000/hr or retry after the reset window',
        })
        stoppedOn = 'github-rate-limit'
        break
      }
      try {
        await col.updateOne(
          { hackathonId: hk.id, submissionId },
          { $set: { ...pack, hackathonId: hk.id, submissionId } },
          { upsert: true },
        )
        newlyCached++
      } catch (e) {
        console.error('[repo-audit-all] cache write failed', e)
        // Still report the pack outcome — caching is best-effort.
      }
      if (pack.repoAccessible === true) {
        audited.push({ submissionId, ok: true })
      } else {
        const detail = ((pack.limitations || [])[0] || '').trim()
        audited.push({
          submissionId,
          ok: false,
          error: detail || 'repo not publicly accessible — connect GitHub OAuth and retry',
        })
      }
    } catch {
      audited.push({ submissionId, ok: false, error: 'audit failed' })
    }
  }

  const remaining = attemptable.length - newlyCached
  return NextResponse.json({ ok: true, audited, skipped, stoppedOn, remaining })
}
