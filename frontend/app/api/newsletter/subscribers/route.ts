/**
 * GET  /api/newsletter/subscribers — admin list (superadmin).
 * POST /api/newsletter/send         — admin broadcast to all subscribed emails.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { newsletterSubscribers } from '@/lib/db/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100') || 100, 500)
  const offset = parseInt(searchParams.get('offset') || '0') || 0

  try {
    const col = await newsletterSubscribers()
    const [subscribers, total, subscribed] = await Promise.all([
      col.find({}).sort({ created_at: -1 }).skip(offset).limit(limit).toArray(),
      col.countDocuments({}),
      col.countDocuments({ status: 'subscribed' }),
    ])
    return NextResponse.json({ subscribers, total, subscribed, limit, offset })
  } catch (e) {
    console.error('[newsletter] list error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as { subject?: string; content?: string }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!subject || !content) {
    return NextResponse.json({ error: 'subject and content are required' }, { status: 400 })
  }

  try {
    const col = await newsletterSubscribers()
    const subs = await col.find({ status: 'subscribed' }).project({ email: 1, _id: 0 }).toArray()
    if (subs.length === 0) {
      return NextResponse.json({ error: 'No active subscribers yet' }, { status: 400 })
    }

    const { emailTemplates } = await import('@/lib/email-templates')
    const { sendEmail } = await import('@/lib/send-email')
    const { createHmac } = await import('node:crypto')
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    let sent = 0
    let failed = 0
    for (const sub of subs) {
      const email = String(sub.email)
      try {
        const hmacSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'codespectra-default-secret'
        const hmacToken = createHmac('sha256', hmacSecret).update(email.toLowerCase()).digest('hex').slice(0, 16)
        const tpl = emailTemplates.newsletter({ subject, body: content })
        // Inject each recipient's email + HMAC token into the per-recipient unsubscribe link.
        const html = tpl.html
          .split('__EMAIL__').join(encodeURIComponent(email))
          .replace(/unsubscribe\?email=[^"]*/, `unsubscribe?email=${encodeURIComponent(email)}&t=${hmacToken}`)
        await sendEmail(email, { subject: tpl.subject, html })
        sent++
      } catch {
        failed++
      }
    }

    return NextResponse.json({ ok: true, sent, failed, total: subs.length })
  } catch (e) {
    console.error('[newsletter] send error:', e)
    return NextResponse.json({ error: 'Failed to send newsletter' }, { status: 500 })
  }
}
