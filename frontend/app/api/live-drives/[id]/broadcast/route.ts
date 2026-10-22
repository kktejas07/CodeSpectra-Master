/** POST /api/live-drives/[id]/broadcast  { message } — announcement to every candidate (organisers). */
import { limitRequest } from '@/lib/rate-limit'
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { broadcast } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('broadcast', async (user) => {
    const limited = await limitRequest(req, 'live-drive-broadcast', user.id, 20, 10 * 60_000)
    if (limited) return limited
    return json({ broadcast: await broadcast(user, id, await body(req)) })
  })
}
