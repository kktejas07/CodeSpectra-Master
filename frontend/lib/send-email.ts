import { logEmailSend, type EmailDeliveryStatus } from '@/lib/db/email-logs'
import { logger } from '@/lib/logger'

function maskEmail(email: string): string {
  if (process.env.NODE_ENV === 'production') {
    const [local, domain] = email.split('@')
    return `${local?.slice(0, 2)}***@${domain || '***'}`
  }
  return email
}

export async function sendEmail(to: string, template: { subject: string; html: string }, cc?: string, opts?: { category?: string; campaignId?: string }) {
  let postalMessageId: number | null = null

  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    const result = await sendEmailViaPostal({ to, subject: template.subject, html: template.html, cc })
    postalMessageId = result.messageId
    logger.email(`[Email] Sent via Postal`, { to, subject: template.subject })
  } catch (e) {
    logger.email(`[Email] Postal unavailable — logged only`, { to, subject: template.subject })
  }

  // Fire-and-forget log to email_logs collection for monitoring
  logEmailSend({
    to,
    subject: template.subject,
    category: (opts?.category as any) || 'transactional',
    campaignId: opts?.campaignId || null,
    postalMessageId,
  }).catch(() => {
    // Don't break email send if logging fails
  })

  return { success: true, provider: postalMessageId ? 'postal' as const : 'log' as const, postalMessageId }
}
