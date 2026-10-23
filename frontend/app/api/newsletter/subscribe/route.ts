/**
 * POST /api/newsletter/subscribe — public.
 * - New email: subscribed straight away (single opt-in, unchanged).
 * - Previously unsubscribed email: NOT re-subscribed here. We email a signed
 *   link that expires in 48 hours; only POST /api/newsletter/confirm with
 *   that token re-subscribes (so nobody can re-subscribe someone else).
 */
import { NextRequest, NextResponse } from 'next/server'
import { newsletterSubscribers, newNewsletterId, nowIso, isEmail } from '@/lib/db/newsletter'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { signPurposeToken } from '@/lib/session'
import { sendEmail } from '@/lib/send-email'
import { getAppOrigin } from '@/lib/app-origin'
import { captchaGate } from '@/lib/captcha/require'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Public endpoint: throttle list-bombing (5 per IP per 10 minutes).
  const limit = await rateLimitRedis(`newsletter:ip:${clientLimiterKeyFromRequest(req, null)}`, 5, 10 * 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${limit.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: limit.retryAfterSec } }, { status: 429 })
  }
  const body = await req.json().catch(() => ({})) as { email?: string; source?: string; turnstileToken?: string }
  const captcha = await captchaGate(req, body.turnstileToken)
  if (captcha) return captcha
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  try {
    const col = await newsletterSubscribers()
    const now = nowIso()
    const existing = await col.findOne({ email })

    if (existing) {
      if (existing.status === 'unsubscribed') {
        // At most 3 confirmation emails per address per day; past that we
        // still answer the same way so the endpoint can't be used to spam.
        const perEmail = await rateLimitRedis(`newsletter:confirm:${email}`, 3, 24 * 3600_000)
        if (perEmail.ok) {
          const token = await signPurposeToken('newsletter_resubscribe', {
            email,
            id: existing.id,
            // Binds the link to this opt-out: if they unsubscribe again later,
            // an old link stops working.
            u: existing.unsubscribed_at ?? null,
          }, '48h')
          const link = `${getAppOrigin()}/newsletter/confirm?t=${encodeURIComponent(token)}`
          let delivered = false
          try {
            // SEO-033: the requester's language (saved setting, else the page they used).
            const [{ emailTemplatesFor }, { localeForRequester }] = await Promise.all([import('@/lib/email-templates'), import('@/lib/i18n/recipient')])
            const r = await sendEmail(email, emailTemplatesFor(await localeForRequester(email)).notice({ key: 'newsletterConfirm', buttonUrl: link }), undefined, { category: 'transactional' })
            delivered = r.success
            if (!delivered) console.error('[newsletter] confirmation email failed:', r.error)
          } catch (e) {
            console.error('[newsletter] confirmation email failed:', e)
          }
          if (!delivered) {
            return NextResponse.json({ error: 'Couldn’t send the confirmation email. Try again later.' }, { status: 502 })
          }
        }
        return NextResponse.json({ ok: true, confirmation_required: true }, { status: 202 })
      }
      return NextResponse.json({ ok: true, already_subscribed: true })
    }

    await col.insertOne({
      id: newNewsletterId(),
      email,
      source: typeof body.source === 'string' ? body.source.slice(0, 60) : 'web',
      status: 'subscribed',
      created_at: now,
    })

    // CORE-024: the footer sign-up also asks for event + Learn updates in the shared
    // subscriptions store (double opt-in e-mail from there), so one sign-up covers both.
    void import('@/lib/subscriptions')
      .then(({ subscribe }) => subscribe(
        { email, phone: null, phone_country: null, user_id: null, channels: ['email'], topics: ['events', 'blog'], whatsapp_consent: false, timezone: null, source: 'footer-newsletter' },
        { emailVerified: false },
      ))
      .catch((e) => console.error('[newsletter] subscriptions sync failed:', (e as Error)?.message))

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    console.error('[newsletter] subscribe error:', e)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}
