/**
 * POST /api/admin/hiring-agents/author[?tenant=] { job_id? | job_description?, title? }
 * Queue a JD → test request for the assessment author agent. The job must be
 * this organisation's; pasted text is kept as data (never instructions) and
 * capped. The agent drafts a create_test proposal for the requester's org owner.
 * `agent_on` in the reply says whether the scheduler will pick it up; when the
 * author agent is off the request waits for "Run now" (or switching it on).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readJson } from '@/lib/agent/http'
import { hiringAgentsGate } from '@/lib/agent/hiring-loops/http'
import { limitRequest } from '@/lib/rate-limit'
import { newId, nowIso } from '@/lib/db/ids'

export const dynamic = 'force-dynamic'

const Body = z.object({
  job_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  job_description: z.string().trim().min(40).max(20_000).optional(),
  title: z.string().trim().min(3).max(200).optional(),
}).strict().refine((b) => !!b.job_id !== !!b.job_description, { message: 'Give a job id or a job description (one of them).' })

export async function POST(req: Request) {
  const gate = await hiringAgentsGate(req)
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'hiring-agents-author', gate.caller.userId, 20, 60 * 60_000)
  if (limited) return limited
  const parsed = Body.safeParse(await readJson(req))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const b = parsed.data
  if (b.job_id) {
    const { atsJobs } = await import('@/lib/ats/db')
    const job = await (await atsJobs()).findOne({ id: b.job_id, tenant_id: gate.tenantId }, { projection: { _id: 1 } })
    if (!job) return NextResponse.json({ error: 'Job not found', code: 'ats_job_not_found' }, { status: 404 })
  }
  const { authorRequests } = await import('@/lib/agent/hiring-loops/store')
  const col = await authorRequests()
  const open = await col.countDocuments({ tenant_id: gate.tenantId, status: { $in: ['queued', 'working'] } })
  if (open >= 10) return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited' }, { status: 429 })
  const ts = nowIso()
  const doc = {
    id: newId(), tenant_id: gate.tenantId, created_by: gate.caller.userId, job_id: b.job_id ?? null, jd_text: b.job_description ?? null,
    title: b.title ?? null, status: 'queued' as const, attempts: 0, created_at: ts, updated_at: ts,
  }
  await col.insertOne({ ...doc })
  // The scheduler only works the queue for organisations that switched the author on (AGT-036 / CORE-044):
  // tell the client so it can say so and offer "switch on" / "run once now" instead of promising 15 minutes.
  const { getLoopSettings } = await import('@/lib/agent/hiring-loops/store')
  const agentOn = (await getLoopSettings(gate.tenantId, 'author')).settings.enabled
  return NextResponse.json({ request: { id: doc.id, status: doc.status, title: doc.title, job_id: doc.job_id, created_at: ts }, agent_on: agentOn }, { status: 201 })
}
