/**
 * POST /api/public/ask — "Ask about events & news" (public).
 * Body: { q, mode?: 'ask' | 'search', locale?: 'en' | 'hi' | 'te', types?, turnstileToken? } (strict).
 *
 * Retrieval is PUBLIC content only (digests, news, events feed, Learn, docs /
 * FAQ — lib/rag/public); the filter is fixed server side and `types` can only
 * narrow it. Limits: 6/min and 60/day per IP, 100/day per signed-in user;
 * anonymous visitors solve Turnstile after 3 questions a day; a platform-wide
 * daily AI cap and the AI budget hard stop. Without AI (off, capped, flagged,
 * failed) the answer is the plain hybrid search results.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'
import { captchaGate } from '@/lib/captcha/require'
import { clientIpOrEmpty } from '@/lib/client-ip'
import { AskBodySchema, PUBLIC_ASK_LIMITS, captchaRequired } from '@/lib/public-ask/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const parsed = AskBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const b = parsed.data
  const user = await getAPIUser().catch(() => null)
  const perMinute = await limitRequest(req, 'public-ask:min', null, PUBLIC_ASK_LIMITS.ipPerMinute, 60_000)
  if (perMinute) return perMinute
  const perDay = await limitRequest(req, 'public-ask:day', null, PUBLIC_ASK_LIMITS.ipPerDay, 86_400_000)
  if (perDay) return perDay
  if (user) {
    const perUser = await limitRequest(req, 'public-ask:user', user.id, PUBLIC_ASK_LIMITS.userPerDay, 86_400_000)
    if (perUser) return perUser
  }
  const svc = await import('@/lib/public-ask/service')
  const ip = clientIpOrEmpty(req)
  if (!user) {
    if (captchaRequired(false, await svc.anonAsksToday(ip))) {
      const captcha = await captchaGate(req, b.turnstileToken)
      if (captcha) return captcha
    }
    await svc.countAnonAsk(ip)
  }
  try {
    const r = await svc.askPublic(b.q, { want: b.mode, locale: b.locale, types: b.types, userId: user?.id ?? null })
    const anon = user ? null : await svc.anonAsksToday(ip)
    return NextResponse.json({ ...r, captcha_next: anon !== null && captchaRequired(false, anon) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[public-ask]:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
