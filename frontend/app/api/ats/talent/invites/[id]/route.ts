import { NextRequest } from 'next/server'
import { errorResponse, gate, idOk, json } from '@/lib/ats/http'
import { TalentError, withdrawInvite } from '@/lib/talent/db'

type Ctx = { params: Promise<{ id: string }> }

/** DELETE /api/ats/talent/invites/[id] — withdraw a pending invite. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await gate(req, 'candidate.add', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return json({ error: 'Invite not found' }, 404)
  try {
    await withdrawInvite(g.actor, id, req)
    return json({ ok: true })
  } catch (e) {
    if (e instanceof TalentError) return json({ error: e.message }, e.status)
    return errorResponse(e, 'talent invite DELETE')
  }
}
