import { logEmailSend, type EmailDeliveryStatus } from '@/lib/db/email-logs'

export async function sendEmail(to: string, template: { subject: string; html: string }, cc?: string, opts?: { category?: string; campaignId?: string }) {
  let postalMessageId: number | null = null

  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    const result = await sendEmailViaPostal({ to, subject: template.subject, html: template.html, cc })
    postalMessageId = result.messageId
    console.log(`[Email] Sent via Postal to ${to}${cc ? ` (cc: ${cc})` : ''}: ${template.subject} (msgId: ${result.messageId})`)
  } catch (e) {
    console.log(`[Email] Postal unavailable (${(e as Error).message}) — logged only. To: ${to}${cc ? ` (cc: ${cc})` : ''}, Subject: ${template.subject}`)
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
