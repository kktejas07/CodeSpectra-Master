import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathons, hackathonSubmissions, hackathonTeams } from '@/lib/db/qr-events'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { getGitHubAccessTokenFromSession } from '@/lib/github-api-auth'
import { auditSubmissionRepo } from '@/lib/hackathons/repo-audit'

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

/** GET: cached audit from `submission_audits` or 404 {audited:false}. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; submissionId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id, submissionId } = await ctx.params
  const gate = await checkJudgeOrAdmin(id, user as { id: string; role?: string; tenantId?: string })
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const col = await auditsCol()
  const cached = await col.findOne({ hackathonId: gate.hk.id, submissionId })
  if (!cached) return NextResponse.json({ audited: false }, { status: 404 })
  const { _id, ...pack } = cached as Record<string, unknown>
  void _id
  return NextResponse.json({ audited: true, ...pack })
}

/**
 * POST: judge/admin only. Loads the event window + submission repo_url,
 * runs auditSubmissionRepo, upserts into submission_audits, returns the pack.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; submissionId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const rateCheck = await rateLimitAIRedis(req, user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  const { id, submissionId } = await ctx.params
  const gate = await checkJudgeOrAdmin(id, user as { id: string; role?: string; tenantId?: string })
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const hk = gate.hk

  const subsCol = await hackathonSubmissions()
  const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
  if (!sub) return NextResponse.json({ error: 'submission not found' }, { status: 404 })
  const repoUrl = (sub.repo_url || '').trim()
  if (!repoUrl) {
    return NextResponse.json({ error: 'submission has no repo_url — nothing to audit' }, { status: 422 })
  }

  // Team size for the effort check (facts only).
  let teamSize = typeof hk.max_per_team === 'number' ? hk.max_per_team : 0
  try {
    const teamsCol = await hackathonTeams()
    const team = sub.team_id ? await teamsCol.findOne({ id: sub.team_id }) : null
    if (team && Array.isArray(team.members) && team.members.length > 0) {
      teamSize = team.members.length
    }
  } catch { /* keep max_per_team fallback */ }

  // Judge's own GitHub OAuth token (same source as /api/github/file-content).
  let githubToken: string | undefined
  try {
    const gh = await getGitHubAccessTokenFromSession()
    if (gh.ok) githubToken = gh.accessToken
  } catch { /* unauthenticated GitHub access still works for public repos */ }

  let pack
  try {
    pack = await auditSubmissionRepo({
      repoUrl,
      eventStartISO: hk.starts_at || '',
      eventEndISO: hk.ends_at || '',
      teamSize,
      githubToken,
    })
  } catch (e) {
    console.error('[repo-audit]', e)
    return NextResponse.json({ error: 'audit failed' }, { status: 500 })
  }

  if (!pack.repoAccessible && !githubToken) {
    return NextResponse.json(
      { error: 'private-unreachable', message: 'Repo is not publicly accessible and no GitHub token is connected. Connect GitHub and retry.' },
      { status: 422 },
    )
  }

  try {
    const col = await auditsCol()
    await col.updateOne(
      { hackathonId: hk.id, submissionId },
      { $set: { ...pack, hackathonId: hk.id, submissionId } },
      { upsert: true },
    )
  } catch (e) {
    console.error('[repo-audit] cache write failed', e)
    // Still return the pack — caching is best-effort.
  }

  return NextResponse.json({ audited: true, ...pack })
}
