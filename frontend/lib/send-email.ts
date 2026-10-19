import { logEmailSend, type EmailDeliveryStatus } from '@/lib/db/email-logs'
import { logger } from '@/lib/logger'

export interface SendEmailOptions {
  category?: string
  campaignId?: string
  attachments?: { name: string; content_type: string; data: string }[]
  /** Set by the outbox worker when retrying (a failed retry is not queued again). */
  outboxId?: string
  /** Send even to a suppressed (hard-bounced / complained) address. Admin tests only. */
  skipSuppression?: boolean
  /** Extra headers (List-Unsubscribe…), plain-text part, Reply-To, From display name. */
  headers?: Record<string, string>
  text?: string
  replyTo?: string
  fromName?: string
}

export interface SendEmailResult {
  success: boolean
  provider: 'postal' | 'log'
  postalMessageId: number | null
  error: string | null
  /** The address is on the bounce/complaint suppression list; nothing was sent. */
  suppressed?: boolean
  /** The send failed for a temporary reason and is queued for retry (lib/automation/outbox). */
  queued?: boolean
}

export async function sendEmail(to: string, template: { subject: string; html: string }, cc?: string, opts?: SendEmailOptions): Promise<SendEmailResult> {
  let postalMessageId: number | null = null
  let error: string | null = null

  // A-038: never mail an address that hard-bounced or complained.
  if (!opts?.skipSuppression) {
    try {
      const { isSuppressed } = await import('@/lib/automation/outbox')
      if (await isSuppressed(to)) {
        logger.email('[Email] Skipped suppressed address', { to, subject: template.subject })
        return { success: false, provider: 'log', postalMessageId: null, error: 'suppressed', suppressed: true }
      }
    } catch { /* suppression lookup is best-effort */ }
  }

  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    const result = await sendEmailViaPostal({ to, subject: template.subject, html: template.html, cc, attachments: opts?.attachments, headers: opts?.headers, text: opts?.text, replyTo: opts?.replyTo, fromName: opts?.fromName })
    postalMessageId = result.messageId
    logger.email(`[Email] Sent via Postal`, { to, subject: template.subject })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    logger.error(`[Email] Postal FAILED: ${error}`, { to, subject: template.subject })
    console.error('[Email] Postal send failed:', e)
  }

  // A-036: a temporary failure goes to the outbox and is retried with backoff.
  let queued = false
  if (error && !opts?.outboxId) {
    try {
      const { enqueueFailedEmail } = await import('@/lib/automation/outbox')
      queued = await enqueueFailedEmail({ to, subject: template.subject, html: template.html, cc, category: opts?.category, campaignId: opts?.campaignId, attachments: opts?.attachments, headers: opts?.headers, fromName: opts?.fromName }, error)
    } catch { /* the outbox is best-effort */ }
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

  return { success: postalMessageId !== null, provider: postalMessageId ? 'postal' as const : 'log' as const, postalMessageId, error, ...(queued ? { queued } : {}) }
}

export type { EmailDeliveryStatus }
