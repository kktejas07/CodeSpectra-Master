import { NextRequest, NextResponse } from 'next/server'
import {
  atsCollection,
  atsComments,
  auditAts,
  can,
  canSeeApplication,
  getAccessSettings,
  isAssignedInterviewer,
  parseId,
  requireAts,
  tenantFromRequest,
  type AtsCommentDoc,
} from '@/lib/ats/access'
import type { AtsActor, AtsApplication, AtsJob } from '@/lib/ats/contract'
import { limitRequest } from '@/lib/rate-limit'
import { newId, nowIso } from '@/lib/db/ids'

type Ctx = { params: Promise<{ id: string }> }

/** Load the application + job and check the actor may see it (404 otherwise — no existence leak). */
async function loadVisible(actor: AtsActor, appId: string): Promise<{ app: AtsApplication; job: AtsJob } | null> {
  const app = await (await atsCollection<AtsApplication>('applications')).findOne({ id: appId, tenant_id: actor.tenantId }, { projection: { _id: 0 } })
  if (!app) return null
  const job = await (await atsCollection<AtsJob>('jobs')).findOne({ id: app.job_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })
  if (!job) return null
  const [settings, interviewerAssigned] = await Promise.all([
    getAccessSettings(actor.tenantId),
    actor.role === 'interviewer' ? isAssignedInterviewer(actor, appId) : Promise.resolve(false),
  ])
  return canSeeApplication(actor, app as AtsApplication, job as AtsJob, { settings, interviewerAssigned }) ? { app: app as AtsApplication, job: job as AtsJob } : null
}

function canRead(actor: AtsActor): 'all' | 'client' | null {
  if (can(actor, 'comment.internal')) return 'all'
  if (can(actor, 'comment.client')) return 'client'
  return null
}

/** GET /api/ats/applications/[id]/comments — internal + client comments (clients: client-visible only). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireAts([], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const scope = canRead(actor)
  if (!scope) return NextResponse.json({ error: "Your hiring role can't see comments" }, { status: 403 })
  try {
    if (!(await loadVisible(actor, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const filter: Record<string, unknown> = { tenant_id: actor.tenantId, application_id: id }
    if (scope === 'client') filter.visibility = 'client'
    const comments = await (await atsComments()).find(filter, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(500).toArray()
    return NextResponse.json({ comments })
  } catch (e) {
    console.error('[ats/comments] GET failed:', e)
    return NextResponse.json({ error: 'Could not load comments' }, { status: 500 })
  }
}

/** POST /api/ats/applications/[id]/comments { body, visibility: 'internal' | 'client' } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireAts([], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const limited = await limitRequest(req, 'ats-comment', actor.userId, 30, 60_000)
  if (limited) return limited

  let raw: Record<string, unknown>
  try {
    const b = await req.json()
    raw = b && typeof b === 'object' ? b : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  // eslint-disable-next-line no-control-regex
  const text = typeof raw.body === 'string' ? raw.body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : ''
  if (!text) return NextResponse.json({ error: 'Write a comment first' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'Keep comments under 4,000 characters' }, { status: 400 })
  // Clients can only post client-visible comments.
  const visibility: AtsCommentDoc['visibility'] = actor.role === 'client' ? 'client' : raw.visibility === 'client' ? 'client' : 'internal'
  if (!can(actor, visibility === 'client' ? 'comment.client' : 'comment.internal')) {
    return NextResponse.json({ error: "Your hiring role can't post this comment" }, { status: 403 })
  }

  try {
    const hit = await loadVisible(actor, id)
    if (!hit) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const doc: AtsCommentDoc = {
      id: newId(),
      tenant_id: actor.tenantId,
      application_id: id,
      job_id: hit.job.id,
      author_id: actor.userId,
      author_name: actor.name || actor.email,
      author_role: actor.role,
      visibility,
      body: text,
      created_at: nowIso(),
    }
    await (await atsComments()).insertOne({ ...doc })
    await auditAts(actor, 'ats.comment.create', 'ats_application', id, `${visibility} comment`, req)
    return NextResponse.json({ comment: doc }, { status: 201 })
  } catch (e) {
    console.error('[ats/comments] POST failed:', e)
    return NextResponse.json({ error: 'Could not save the comment' }, { status: 500 })
  }
}
