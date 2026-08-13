/**
 * POST /api/newsletter/admin/send-test — send a test newsletter to a single email.
 * POST /api/newsletter/admin/preview — render HTML preview of newsletter content.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'

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
    // Return rendered HTML preview
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
    const { emailTemplates } = await import('@/lib/email-templates')
    const { sendEmail } = await import('@/lib/send-email')

    const html = renderNewsletterHtml({
      subject,
      hero_image: body.hero_image,
      intro: body.intro,
      body: body.body,
      cta_text: body.cta_text,
      cta_url: body.cta_url,
    })

    const result = await sendEmail(to, { subject: `[Test] ${subject}`, html })
    return NextResponse.json({ ok: true, sent: true, provider: result.provider })
  } catch (e) {
    console.error('[newsletter] test send error:', e)
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
  }
}

function renderNewsletterHtml(params: {
  subject: string
  hero_image?: string
  intro?: string
  body?: string
  cta_text?: string
  cta_url?: string
}): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { subject, hero_image, intro, body, cta_text, cta_url } = params

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header Badge -->
        <tr><td align="center" style="padding-bottom:24px">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:600;letter-spacing:0.5px">CODESPECTRA</div>
        </td></tr>
        <!-- Hero Image -->
        ${hero_image ? `<tr><td style="padding-bottom:24px"><img src="${hero_image}" alt="" style="width:100%;border-radius:12px;display:block" /></td></tr>` : ''}
        <!-- Card -->
        <tr><td style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <!-- Subject -->
          <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 16px;line-height:1.3">${subject}</h1>
          <!-- Intro -->
          ${intro ? `<p style="font-size:15px;color:#52525b;line-height:1.65;margin:0 0 16px">${intro}</p>` : ''}
          <!-- Body -->
          ${body ? `<div style="font-size:15px;color:#18181b;line-height:1.65;margin:0 0 24px">${body}</div>` : ''}
          <!-- CTA -->
          ${cta_text && cta_url ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="background:#7c3aed;border-radius:8px;padding:12px 28px"><a href="${cta_url}" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">${cta_text}</a></td></tr></table>` : ''}
          <!-- Footer -->
          <p style="font-size:12px;color:#a1a1aa;margin:16px 0 0;border-top:1px solid #e4e4e7;padding-top:16px">
            You're receiving this because you subscribed to CodeSpectra updates.
            <a href="${base}/api/newsletter/unsubscribe?email=__EMAIL__" style="color:#22c55e;text-decoration:underline">Unsubscribe</a>
          </p>
        </td></tr>
        <!-- Branding Footer -->
        <tr><td align="center" style="padding:20px 0 0">
          <p style="font-size:11px;color:#a1a1aa;margin:0">CodeSpectra &copy; ${new Date().getFullYear()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
