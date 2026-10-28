/** GET /api/live-drives/[id]/paper — the question paper (no answers) for a candidate who has started. */
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { badId, handle, ID_RE, json } from '@/lib/live-drives/http'
import { candidatePaper } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('paper', async (user) => {
    const rl = rateLimitSlidingWindow(`ld-paper:${user.id}`, 20, 60_000)
    if (!rl.ok) return json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited', params: { seconds: rl.retryAfterSec } }, 429)
    return json(await candidatePaper(user, id))
  })
}
