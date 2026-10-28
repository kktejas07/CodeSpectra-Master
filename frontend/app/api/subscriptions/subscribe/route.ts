/**
 * POST /api/subscriptions/subscribe — public.
 * Body: { email?, phone?, phone_country?, channels[], topics[], filters?, whatsapp_consent?, timezone?, source?, locale?, turnstileToken? }
 * A signed-in user's own account email skips double opt-in; everything else is
 * confirmed by email link / WhatsApp YES before anything is sent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { getAPIUser } from '@/lib/route-auth'
import { subscribe, getSubscriptionSettings } from '@/lib/subscriptions'
import { captchaGate } from '@/lib/captcha/require'
import { LOCALE_COOKIE, toLocale } from '@/lib/i18n/config'
import { resolveLocale } from '@/lib/i18n/negotiate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const limit = await rateLimitRedis(`subs:ip:${clientLimiterKeyFromRequest(req, null)}`, 6, 10 * 60_000)
  if (!limit.ok) return NextResponse.json({ error: `Too many requests. Try again in ${limit.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: limit.retryAfterSec } }, { status: 429 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const user = await getAPIUser().catch(() => null)
  // Signed-in people are already past login's bot check; anonymous sign-ups solve Turnstile.
  if (!user) {
    const captcha = await captchaGate(req, body.turnstileToken)
    if (captcha) return captcha
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  try {
    const r = await subscribe(
      {
        email: email || null,
        phone: typeof body.phone === 'string' ? body.phone : null,
        phone_country: typeof body.phone_country === 'string' ? body.phone_country.slice(0, 2) : null,
        user_id: user?.id || null,
        channels: Array.isArray(body.channels) ? (body.channels as never[]) : [],
        topics: Array.isArray(body.topics) ? (body.topics as never[]) : [],
        filters: (body.filters && typeof body.filters === 'object' ? body.filters : undefined) as never,
        whatsapp_consent: body.whatsapp_consent === true,
        timezone: typeof body.timezone === 'string' ? body.timezone : null,
        source: typeof body.source === 'string' ? body.source.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : 'web',
        // SEO-054: the page language (sent by the form), else the visitor's cookie / browser language.
        locale: toLocale(body.locale) ?? resolveLocale({ cookie: req.cookies.get(LOCALE_COOKIE)?.value, acceptLanguage: req.headers.get('accept-language') }),
      },
      { emailVerified: Boolean(user && email && user.email?.toLowerCase() === email) },
    )
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    const s = await getSubscriptionSettings()
    return NextResponse.json({
      ok: true,
      email: r.email,
      whatsapp: r.whatsapp,
      // Lets the person confirm by messaging START themselves (user-initiated, no template needed).
      whatsapp_start_link: r.whatsapp === 'confirmation_sent' && s.whatsapp_display_number
        ? `https://wa.me/${s.whatsapp_display_number.replace(/\D/g, '')}?text=START`
        : null,
    })
  } catch (e) {
    console.error('[subscriptions] subscribe failed:', (e as Error).message)
    return NextResponse.json({ error: 'Couldn’t save your subscription. Try again later.' }, { status: 500 })
  }
}
