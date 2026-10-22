/**
 * POST   /api/live-drives/[id]/roster   { source: campus|ats|emails, emails? } — add candidates (batched upserts)
 * DELETE /api/live-drives/[id]/roster?candidate=  remove someone who has not started
 */
import { limitRequest } from '@/lib/rate-limit'
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { importRoster, removeCandidate } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('roster', async (user) => {
    const limited = await limitRequest(req, 'live-drive-roster', user.id, 30, 60 * 60_000)
    if (limited) return limited
    return json(await importRoster(user, id, await body(req, 600_000)))
  })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params
  const cid = new URL(req.url).searchParams.get('candidate') || ''
  if (!ID_RE.test(id) || !ID_RE.test(cid)) return badId()
  return handle('roster remove', async (user) => {
    await removeCandidate(user, id, cid)
    return json({ ok: true })
  })
}
