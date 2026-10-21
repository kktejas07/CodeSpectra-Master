/**
 * POST /api/campus/join
 *   { token, roll_no? }               accept an invite link (verified by college email domain or roll number)
 *   { college, roll_no, name? }       join without an invite (college email domain required)
 * Rate limited (roll numbers must not be guessable by retrying).
 */
import { NextResponse } from 'next/server'
import { guarded, readJson, unauthorized, withUser } from '@/lib/campus/access'
import { joinByInvite, selfJoin } from '@/lib/campus/service'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return guarded('join', async () => {
    const user = await withUser()
    if (!user) return unauthorized()
    const rl = await rateLimitRedis(`campus-join:${user.id}`, 10, 900_000)
    if (!rl.ok) return NextResponse.json({ error: 'Too many attempts — try again in a few minutes', code: 'campus_attempts' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
    const body = await readJson(req, 10_000)
    const r = body.token !== undefined
      ? await joinByInvite(user, body.token, body.roll_no)
      : await selfJoin(user, body.college, body.roll_no, body.name)
    return NextResponse.json(r)
  })
}
