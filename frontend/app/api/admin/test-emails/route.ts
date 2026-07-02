import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { emailTemplates } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: { email?: string; template?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const toEmail = body.email || 'vutukurudevender@gmail.com'
  const templateKey = body.template || 'all'

  const results: string[] = []

  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')

    const templates: Record<string, { subject: string; html: string }> = {
      welcomeEmail: emailTemplates.welcomeEmail('John Doe'),
      jobApplicationConfirmation: emailTemplates.jobApplicationConfirmation('Software Engineer', 'Acme Inc', 'Jane'),
      examStartedNotification: emailTemplates.examStartedNotification('JavaScript Fundamentals', 'Jane'),
      subscriptionConfirmation: emailTemplates.subscriptionConfirmation('Pro', 2999),
      invoiceNotification: emailTemplates.invoiceNotification('INV-001', 2999, 'Pro'),
    }

    if (templateKey === 'all') {
      for (const [key, tmpl] of Object.entries(templates)) {
        try {
          await sendEmailViaPostal({ to: toEmail, subject: tmpl.subject, html: tmpl.html })
          results.push(`✓ ${key} sent`)
        } catch (e: any) {
          results.push(`✗ ${key}: ${e.message}`)
        }
      }
    } else if (templates[templateKey]) {
      const tmpl = templates[templateKey]
      try {
        await sendEmailViaPostal({ to: toEmail, subject: tmpl.subject, html: tmpl.html })
        results.push(`✓ ${templateKey} sent`)
      } catch (e: any) {
        results.push(`✗ ${templateKey}: ${e.message}`)
      }
    } else {
      return NextResponse.json({ error: `Unknown template: ${templateKey}. Available: ${Object.keys(templates).join(', ')}, all` }, { status: 400 })
    }

    return NextResponse.json({ message: 'Test emails processed', results, to: toEmail })
  } catch (e: any) {
    return NextResponse.json({ error: `Email system error: ${e.message}. Make sure Postal is configured in Platform Settings → Mail.` }, { status: 500 })
  }
}
