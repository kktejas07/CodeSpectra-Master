/**
 * GET /api/live-drives/[id]/control?since=&group=&status=&q=&page=
 * Control room poll (clients back off on errors and hidden tabs): status
 * counts, the candidate grid (invigilators: their groups only) and new
 * integrity flags since the `since` cursor.
 */
import { limitRequest } from '@/lib/rate-limit'
import { badId, handle, ID_RE, json } from '@/lib/live-drives/http'
import { controlRoom } from '@/lib/live-drives/service'
import { GRID_STATUSES } from '@/lib/live-drives/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('control', async (user) => {
    const limited = await limitRequest(req, 'live-drive-control', user.id, 60, 60_000)
    if (limited) return limited
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')
    return json(await controlRoom(user, id, {
      since: Number(sp.get('since')) || undefined,
      group: Number(sp.get('group')) || null,
      status: status && (GRID_STATUSES as readonly string[]).includes(status) ? status : null,
      search: sp.get('q'),
      page: Number(sp.get('page')) || 1,
    }))
  })
}
