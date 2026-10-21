/**
 * POST /api/contact — public "Book a pilot" / contact form.
 *
 * Stores the request in `contact_requests` (so nothing is lost if email is
 * down) and notifies the team inbox. Rate-limited per IP; Turnstile is
 * enforced when it is configured, same as signup.
 *
 * Inbox: CONTACT_INBOX env, falling back to support@codespectra.ai.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getMongoDb } from '@/lib/mongodb'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientIpOrEmpty } from '@/lib/client-ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOPICS = ['pilot', 'sales', 'support', 'other'] as const
type Topic = (typeof TOPICS)[number]

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export async function POST(req: NextRequest) {
  // A-043: shared limiter (Redis, else Mongo) so every instance counts together.
  const limit = await rateLimitRedis(`contact:${clientLimiterKeyFromRequest(req, null)}`, 5, 10 * 60 * 1000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many messages from this connection. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const str = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '')
  const name = str('name', 100)
  const email = str('email', 200).toLowerCase()
  const organisation = str('organisation', 150)
  const role = str('role', 120)
  const message = str('message', 4000)
  const topic: Topic = TOPICS.includes(body.topic as Topic) ? (body.topic as Topic) : 'other'
  const turnstileToken = str('turnstileToken', 2048)

  const errors: Record<string, string> = {}
  if (!name) errors.name = 'Enter your name.'
  if (!isEmail(email)) errors.email = 'Enter a valid work email, like you@company.com.'
  if (message.length < 10) errors.message = 'Tell us a little more — at least 10 characters.'
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Check the highlighted fields.', fields: errors }, { status: 400 })

  const ip = clientIpOrEmpty(req)
  try {
    const { verifyTurnstileToken, isCaptchaConfigured } = await import('@/lib/captcha/turnstile')
    if (await isCaptchaConfigured()) {
      if (!turnstileToken) return NextResponse.json({ error: 'Complete the verification and send again.' }, { status: 403 })
      const result = await verifyTurnstileToken(turnstileToken, ip)
      if (!result.ok) return NextResponse.json({ error: 'Verification failed. Refresh the page and try again.', code: 'captcha_invalid' }, { status: 403 })
    }
  } catch (e) {
    console.error('[contact] captcha check failed:', e)
  }

  const doc = {
    _id: randomUUID(),
    name,
    email,
    organisation: organisation || null,
    role: role || null,
    topic,
    message,
    status: 'new',
    source: str('source', 60) || 'contact-page',
    user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
    created_at: new Date().toISOString(),
  }

  try {
    const db = await getMongoDb()
    await db.collection('contact_requests').insertOne(doc as never)
  } catch (e) {
    console.error('[contact] store failed:', e)
    return NextResponse.json({ error: 'Your message could not be sent. Email support@codespectra.ai instead.' }, { status: 500 })
  }

  // Notify the team; the request is already stored, so an email failure is logged, not surfaced.
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const topicLabel = { pilot: 'Pilot request', sales: 'Sales question', support: 'Support', other: 'General' }[topic]
    const rows = [
      ['Name', name],
      ['Email', email],
      ['Organisation', organisation || '—'],
      ['Role', role || '—'],
    ]
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
      .join('')
    await sendEmail(process.env.CONTACT_INBOX || 'support@codespectra.ai', {
      subject: `[CodeSpectra] ${topicLabel}: ${name}${organisation ? ` (${organisation})` : ''}`,
      html: `<h2 style="font-family:sans-serif">${topicLabel}</h2><table style="font-family:sans-serif;font-size:14px">${rows}</table><p style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(message)}</p>`,
    }, undefined, { category: 'contact' })
  } catch (e) {
    console.error('[contact] notify failed:', e)
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
