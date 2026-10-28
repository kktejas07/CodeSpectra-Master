/**
 * Candidate side of a live drive (own row only).
 *   GET  ?since=&answers=1   lobby / test state, server time, new messages (answers to restore after a reload)
 *   POST { op: check | start | heartbeat | save | submit, … }
 * Heartbeats and saves are limited per instance (in-memory) to keep Redis out
 * of the hot path at 1,000 concurrent candidates; start/check use Redis.
 */
import { limitRequest } from '@/lib/rate-limit'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { sessionOp, sessionState } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('session GET', async (user) => {
    const rl = rateLimitSlidingWindow(`ld-session-get:${user.id}`, 60, 60_000)
    if (!rl.ok) return json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited', params: { seconds: rl.retryAfterSec } }, 429)
    const sp = new URL(req.url).searchParams
    return json(await sessionState(user, id, { since: Number(sp.get('since')) || 0, answers: sp.get('answers') === '1' }))
  })
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('session', async (user) => {
    const raw = (await body(req, 400_000)) as { op?: unknown } | null
    const op = typeof raw?.op === 'string' ? raw.op : ''
    if (op === 'check' || op === 'start') {
      const limited = await limitRequest(req, `live-drive-${op}`, user.id, 30, 10 * 60_000)
      if (limited) return limited
    } else {
      const rl = rateLimitSlidingWindow(`ld-session:${user.id}`, 40, 60_000)
      if (!rl.ok) return json({ error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited', params: { seconds: rl.retryAfterSec } }, 429)
    }
    return json(await sessionOp(user, id, raw))
  })
}
