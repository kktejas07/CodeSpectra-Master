import { logEmailSend, type EmailDeliveryStatus } from '@/lib/db/email-logs'
import { logger } from '@/lib/logger'

export async function sendEmail(to: string, template: { subject: string; html: string }, cc?: string, opts?: { category?: string; campaignId?: string }) {
  let postalMessageId: number | null = null
  let error: string | null = null

  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    const result = await sendEmailViaPostal({ to, subject: template.subject, html: template.html, cc })
    postalMessageId = result.messageId
    logger.email(`[Email] Sent via Postal`, { to, subject: template.subject })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    logger.error(`[Email] Postal FAILED: ${error}`, { to, subject: template.subject })
    console.error('[Email] Postal send failed:', e)
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

  return { success: postalMessageId !== null, provider: postalMessageId ? 'postal' as const : 'log' as const, postalMessageId, error }
}
