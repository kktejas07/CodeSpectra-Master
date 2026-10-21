import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { reportSchema } from '@/lib/talent/core'
import { blockOrReport, TalentError } from '@/lib/talent/db'

/**
 * POST /api/passport/blocks — block (or unblock) an organisation that
 * contacted you, optionally reporting it to the platform team. A blocked
 * organisation no longer finds you in search and its open invites close.
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rl = await rateLimitRedis(`talent-block:${user.id}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  const parsed = reportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    await blockOrReport(user.id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof TalentError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[talent] block failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Couldn’t save. Try again.' }, { status: 500 })
  }
}
