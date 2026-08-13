/**
 * POST /api/newsletter/admin/send-test — send a test newsletter or render preview.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { renderNewsletterHtml } from '@/lib/newsletter-html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as {
    action?: string
    to?: string
    subject?: string
    hero_image?: string
    intro?: string
    body?: string
    cta_text?: string
    cta_url?: string
  }

  if (body.action === 'preview') {
    const html = renderNewsletterHtml({
      subject: body.subject || 'Preview',
      hero_image: body.hero_image,
      intro: body.intro,
      body: body.body,
      cta_text: body.cta_text,
      cta_url: body.cta_url,
    })
    return NextResponse.json({ ok: true, html })
  }

  // Send test email
  const to = typeof body.to === 'string' ? body.to.trim() : ''
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  }

  try {
    const { sendEmail } = await import('@/lib/send-email')

    const html = renderNewsletterHtml({
      subject,
      hero_image: body.hero_image,
      intro: body.intro,
      body: body.body,
      cta_text: body.cta_text,
      cta_url: body.cta_url,
    })

    console.log('[newsletter] test send:', { to, subject, bodyLen: (body.body || '').length, htmlLen: html.length })

    const result = await sendEmail(to, { subject: `[Test] ${subject}`, html })
    return NextResponse.json({ ok: true, sent: true, provider: result.provider })
  } catch (e) {
    console.error('[newsletter] test send error:', e)
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
  }
}
