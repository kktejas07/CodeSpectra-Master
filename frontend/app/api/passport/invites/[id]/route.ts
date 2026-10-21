import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { respondSchema } from '@/lib/talent/core'
import { respondToInvite, TalentError } from '@/lib/talent/db'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/passport/invites/[id] {action: accept|decline} — accepting shares your email and phone with that organisation. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  const rl = await rateLimitRedis(`talent-respond:${user.id}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  const parsed = respondSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose accept or decline' }, { status: 400 })
  try {
    const invite = await respondToInvite(user.id, id, parsed.data.action)
    return NextResponse.json({ ok: true, invite }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    if (e instanceof TalentError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[talent] respond failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Couldn’t save your answer. Try again.' }, { status: 500 })
  }
}
