/**
 * POST   /api/campus/drives/[id]/apply   a verified, eligible student applies
 * DELETE /api/campus/drives/[id]/apply   withdraw (before shortlisting decisions)
 */
import { NextResponse } from 'next/server'
import { guarded, unauthorized, withUser } from '@/lib/campus/access'
import { applyToDrive, withdraw } from '@/lib/campus/drives'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('apply', async () => {
    const user = await withUser()
    if (!user) return unauthorized()
    const rl = await rateLimitRedis(`campus-apply:${user.id}`, 30, 600_000)
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests', code: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
    return NextResponse.json(await applyToDrive(user, id))
  })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('withdraw', async () => {
    const user = await withUser()
    if (!user) return unauthorized()
    await withdraw(user, id)
    return NextResponse.json({ ok: true })
  })
}
