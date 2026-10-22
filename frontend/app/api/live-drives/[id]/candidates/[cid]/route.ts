/**
 * GET  /api/live-drives/[id]/candidates/[cid]   drill-down: status, timeline, latest snapshot
 * POST /api/live-drives/[id]/candidates/[cid]   { action: warn|add_time|pause|resume|terminate|flag|unflag|allow_rejoin, … } (audited)
 */
import { limitRequest } from '@/lib/rate-limit'
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { candidateAction, candidateDetail } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string; cid: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id, cid } = await params
  if (!ID_RE.test(id) || !ID_RE.test(cid)) return badId()
  return handle('candidate', async (user) => json(await candidateDetail(user, id, cid)))
}

export async function POST(req: Request, { params }: Ctx) {
  const { id, cid } = await params
  if (!ID_RE.test(id) || !ID_RE.test(cid)) return badId()
  return handle('action', async (user) => {
    const limited = await limitRequest(req, 'live-drive-action', user.id, 120, 60_000)
    if (limited) return limited
    return json({ candidate: await candidateAction(user, id, cid, await body(req)) })
  })
}
