/**
 * GET  /api/live-drives/[id]/results   summary + rows (organisers)
 * POST /api/live-drives/[id]/results   { action: 'score' } scores the next batch (call until remaining = 0)
 *                                      { action: 'publish', reject_others?, stage_id? } publish to the linked campus drive / ATS job
 */
import { limitRequest } from '@/lib/rate-limit'
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { resultRows, results, resultSummary } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('results GET', async (user) => {
    const rows = await resultRows(user, id)
    return json({ summary: await resultSummary(id), rows })
  })
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('results', async (user) => {
    const limited = await limitRequest(req, 'live-drive-results', user.id, 120, 60 * 60_000)
    if (limited) return limited
    return json(await results(user, id, await body(req)))
  })
}
