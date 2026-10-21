import { NextRequest } from 'next/server'
import { errorResponse, gate, json } from '@/lib/ats/http'
import { sendInviteSchema } from '@/lib/talent/core'
import { listTenantInvites, quotaState, sendTalentInvite, TalentError } from '@/lib/talent/db'

/** GET /api/ats/talent/invites — invites your organisation sent (contact details on accepted ones only). */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'application.view', ['admin', 'recruiter', 'hiring_manager'])
  if ('res' in g) return g.res
  try {
    const [invites, quota] = await Promise.all([listTenantInvites(g.actor), quotaState(g.actor.tenantId)])
    return json({ invites, quota })
  } catch (e) {
    return errorResponse(e, 'talent invites GET')
  }
}

/** POST /api/ats/talent/invites — invite a discoverable learner to a test, job or interview. */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'candidate.add', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const parsed = sendInviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Pick a learner and what to invite them to.' }, 400)
  try {
    const invite = await sendTalentInvite(g.actor, parsed.data, req)
    const { learner_id: _omit, ...safe } = invite
    return json({ invite: safe }, 201)
  } catch (e) {
    if (e instanceof TalentError) {
      return e.retryAfterSec
        ? Response.json({ error: e.message }, { status: e.status, headers: { 'Retry-After': String(e.retryAfterSec), 'Cache-Control': 'private, no-store' } })
        : json({ error: e.message }, e.status)
    }
    return errorResponse(e, 'talent invites POST')
  }
}
