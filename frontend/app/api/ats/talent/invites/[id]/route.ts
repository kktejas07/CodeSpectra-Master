import { NextRequest } from 'next/server'
import { errorResponse, gate, idOk, json } from '@/lib/ats/http'
import { TalentError, withdrawInvite } from '@/lib/talent/db'
import { apiErrorBody } from '@/lib/api-errors'

type Ctx = { params: Promise<{ id: string }> }

/** DELETE /api/ats/talent/invites/[id] — withdraw a pending invite. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'candidate.add', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Invite not found', code: 'talent_invite_not_found' }, 404)
  try {
    await withdrawInvite(g.actor, id, req)
    return json({ ok: true })
  } catch (e) {
    if (e instanceof TalentError) return json(apiErrorBody(e.message, e.code, e.params), e.status)
    return errorResponse(e, 'talent invite DELETE')
  }
}
